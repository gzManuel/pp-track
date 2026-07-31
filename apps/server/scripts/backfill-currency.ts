/**
 * Second half of the CEDEAR multi-currency migration.
 *
 * The SQL migration reshapes the schema and merges the duplicate CEDEAR assets;
 * this restores the data that needs the FX rate API:
 *
 *   1. Snapshot the MEP and CCL rates on every transaction.
 *   2. Restore the peso price on CEDEAR trades the old code converted away.
 *   3. Rebuild every holding's three cost bases from a full replay.
 *
 * Usage (from apps/server):
 *   pnpm backfill-currency            # apply
 *   pnpm backfill-currency --dry-run  # report only, no writes
 *
 * Safe to re-run: steps 1 and 3 are idempotent, and step 2 is guarded by the
 * `restored` flag on cedear_migration_log.
 */

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { createPrismaClient } from "../src/prisma-client.js";
import { getRates } from "../src/services/fx-rates.js";
import { addMoney, toMoney, ZERO_MONEY } from "../src/services/currency.js";
import { QTY_EPSILON, replayPosition, toReplayTransaction } from "../src/services/holdings.js";
import { currencySchema } from "@repo/api-contract";

const prisma = createPrismaClient();
const dryRun = process.argv.includes("--dry-run");

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

function log(...args: unknown[]) {
  console.log(...args);
}

/**
 * Changes each step would make, kept in memory and layered over what the
 * database returns.
 *
 * Every step feeds the next — the replay cannot run until rates exist, and it
 * should replay restored peso prices rather than the ones being replaced. In a
 * dry run nothing is written, so without this overlay the later steps would
 * either crash on missing rates or report the outcome of a half-applied
 * migration. Applying it in both modes keeps the preview honest: the dry run
 * computes exactly what the real run does, and only the writes differ.
 */
interface Overlay {
  mepRate?: Prisma.Decimal;
  cclRate?: Prisma.Decimal;
  price?: Prisma.Decimal;
  fee?: Prisma.Decimal;
  currency?: string;
}
const overlay = new Map<string, Overlay>();

function stage(id: string, change: Overlay) {
  overlay.set(id, { ...overlay.get(id), ...change });
}

/** A stored row with any staged changes applied. */
function withOverlay<
  T extends {
    id: string;
    price: Prisma.Decimal;
    fee: Prisma.Decimal;
    currency: string;
    mepRate: Prisma.Decimal | null;
    cclRate: Prisma.Decimal | null;
  },
>(row: T): T {
  const staged = overlay.get(row.id);
  return staged ? { ...row, ...staged } : row;
}

interface MigrationLogRow {
  transaction_id: string;
  old_ticker: string;
  new_ticker: string;
  old_currency: string;
  old_price: Prisma.Decimal;
  restored: boolean;
}

/**
 * Step 1 — snapshot both rates on every transaction that lacks them.
 *
 * Rates are fetched per distinct calendar day; the fx-rates cache collapses
 * repeats, so a portfolio with years of history costs one fetch per rate.
 */
async function backfillRates(): Promise<number> {
  const pending = await prisma.transaction.findMany({
    where: { OR: [{ mepRate: null }, { cclRate: null }] },
    select: { id: true, transactedAt: true },
    orderBy: { transactedAt: "asc" },
  });

  if (pending.length === 0) {
    log("  all transactions already carry a rate snapshot");
    return 0;
  }

  // Group by calendar day so each date is fetched once and written in bulk.
  const byDay = new Map<string, { at: Date; ids: string[] }>();
  for (const t of pending) {
    const key = t.transactedAt.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    if (entry) entry.ids.push(t.id);
    else byDay.set(key, { at: t.transactedAt, ids: [t.id] });
  }

  log(`  ${String(pending.length)} transaction(s) across ${String(byDay.size)} date(s)`);

  let updated = 0;
  for (const [day, { at, ids }] of byDay) {
    const { mepRate, cclRate } = await getRates(at);
    log(`    ${day}  mep=${mepRate.toFixed(2)}  ccl=${cclRate.toFixed(2)}  (${String(ids.length)} tx)`);
    for (const id of ids) stage(id, { mepRate: D(mepRate), cclRate: D(cclRate) });
    if (!dryRun) {
      await prisma.transaction.updateMany({
        where: { id: { in: ids } },
        data: { mepRate: D(mepRate), cclRate: D(cclRate) },
      });
    }
    updated += ids.length;
  }
  return updated;
}

/**
 * Step 2 — undo the old ARS→USD rewrite.
 *
 * The original conversion was `price_usd = price_ars / mepRate(transactedAt)`,
 * and the historical series is fixed, so multiplying by the same rate restores
 * the peso price exactly. Two things to be aware of, both reported below:
 *
 * - A trade logged on its own trade date fell back to the *live* rate at that
 *   moment, which has since moved. It is restored at the published daily close,
 *   which is close but not identical.
 * - A row on a `D` variant is only *probably* a converted trade — it could have
 *   been entered directly in USD. Nothing in the old schema distinguishes them.
 *   Every restored row is printed so a wrong one can be spotted and corrected.
 */
async function restorePesoPrices(): Promise<number> {
  const logRows = await prisma.$queryRaw<MigrationLogRow[]>`
    SELECT transaction_id, old_ticker, new_ticker, old_currency, old_price, restored
    FROM cedear_migration_log
    WHERE restored = FALSE AND old_ticker ~* 'D\.BA$' AND UPPER(old_currency) IN ('USD', 'MEP')
  `;

  if (logRows.length === 0) {
    log("  no converted CEDEAR trades to restore");
    return 0;
  }

  log(`  ${String(logRows.length)} trade(s) to restore to ARS:`);
  log("    ticker            date          USD price   ->  ARS price   (rate)");

  let restored = 0;
  for (const row of logRows) {
    const stored = await prisma.transaction.findUnique({
      where: { id: row.transaction_id },
      select: { id: true, price: true, fee: true, currency: true, mepRate: true, cclRate: true, transactedAt: true },
    });
    if (!stored) continue;
    const tx = withOverlay(stored);
    if (!tx.mepRate) {
      log(`    ! ${row.transaction_id} has no rate snapshot — skipped`);
      continue;
    }

    const arsPrice = tx.price.times(tx.mepRate);
    const arsFee = tx.fee.times(tx.mepRate);
    stage(tx.id, { price: arsPrice, fee: arsFee, currency: "ARS" });
    const date = tx.transactedAt.toISOString().slice(0, 10);
    log(
      `    ${row.old_ticker.padEnd(16)}  ${date}  ${tx.price.toFixed(4).padStart(11)}  ->  ${arsPrice.toFixed(2).padStart(11)}  (${tx.mepRate.toFixed(2)})`,
    );

    if (!dryRun) {
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: tx.id },
          data: { price: arsPrice, fee: arsFee, currency: "ARS" },
        }),
        prisma.$executeRaw`UPDATE cedear_migration_log SET restored = TRUE WHERE transaction_id = ${tx.id}::uuid`,
      ]);
    }
    restored++;
  }
  return restored;
}

/**
 * Step 3 — rebuild every holding's three bases from a full replay.
 *
 * An imported base (shares with no backing transactions, from
 * import-portfolio.ts) only ever had a MEP figure, so its ARS and CCL values are
 * approximated at the rates of the holding's earliest transaction — or today's
 * if it has none. Holdings built entirely from transactions, which is all of
 * them unless you ran the importer, are unaffected by that approximation.
 */
async function rebuildHoldings(): Promise<{ rebuilt: number; approximated: number }> {
  const holdings = await prisma.holding.findMany({
    include: { asset: { select: { ticker: true } }, portfolio: { select: { name: true } } },
  });

  let rebuilt = 0;
  let approximated = 0;

  for (const holding of holdings) {
    const rows = await prisma.transaction.findMany({
      where: { portfolioId: holding.portfolioId, assetId: holding.assetId, type: { in: ["BUY", "SELL"] } },
      orderBy: [{ transactedAt: "asc" }, { createdAt: "asc" }],
    });

    const replayed = replayPosition(rows.map((r) => toReplayTransaction(withOverlay(r))));

    // Whatever the transactions do not explain is an imported base.
    let baseQty = holding.quantity.minus(replayed.quantity);
    let baseMep = holding.quantity.times(holding.avgCostBasis).minus(replayed.value.mep);
    if (baseQty.abs().lt(QTY_EPSILON)) {
      baseQty = D(0);
      baseMep = D(0);
    }

    let baseMoney = ZERO_MONEY;
    if (!baseMep.isZero()) {
      const at = rows[0]?.transactedAt ?? new Date();
      const { mepRate, cclRate } = await getRates(at);
      baseMoney = toMoney(baseMep, "MEP", { mepRate: D(mepRate), cclRate: D(cclRate) });
      approximated++;
      log(
        `    ~ ${holding.asset.ticker} (${holding.portfolio.name}): imported base of ${baseQty.toString()} shares converted at ${at.toISOString().slice(0, 10)} rates`,
      );
    }

    const newQty = baseQty.plus(replayed.quantity);
    if (newQty.lt(QTY_EPSILON)) {
      log(`    - ${holding.asset.ticker} (${holding.portfolio.name}): empty after replay, deleting`);
      if (!dryRun) await prisma.holding.delete({ where: { id: holding.id } });
      continue;
    }

    const total = addMoney(baseMoney, replayed.value);
    const next = {
      quantity: newQty,
      avgCostBasis: total.mep.div(newQty),
      avgCostBasisArs: total.ars.div(newQty),
      avgCostBasisCcl: total.ccl.div(newQty),
    };

    log(
      `    ${holding.asset.ticker.padEnd(12)} ${holding.portfolio.name.padEnd(14)} ` +
        `qty ${next.quantity.toFixed(4)}  mep ${next.avgCostBasis.toFixed(4)}  ` +
        `ars ${next.avgCostBasisArs.toFixed(2)}  ccl ${next.avgCostBasisCcl.toFixed(4)}`,
    );

    if (!dryRun) await prisma.holding.update({ where: { id: holding.id }, data: next });
    rebuilt++;
  }

  return { rebuilt, approximated };
}

/** Report rows a human still needs to look at. */
async function reportManualReview() {
  // Overlay-aware, so a dry run reports the count you would actually be left
  // with rather than one that still includes the rows about to become ARS.
  const mepRows = await prisma.transaction.findMany({ where: { currency: "MEP" }, select: { id: true } });
  const migrated = mepRows.filter((t) => (overlay.get(t.id)?.currency ?? "MEP") === "MEP").length;
  if (migrated > 0) {
    log(`\n  ${String(migrated)} transaction(s) are now MEP (previously 'USD').`);
    log("  If any of them are held in an OFFSHORE broker they are really CCL and");
    log("  should be reclassified — MEP and CCL dollars are worth different pesos.");
  }

  // Overlay-aware: in a dry run the rates were computed but not written, and
  // reporting those as unresolved would be a false alarm.
  const stillMissing = await prisma.transaction.findMany({
    where: { OR: [{ mepRate: null }, { cclRate: null }] },
    select: { id: true, transactedAt: true },
  });
  const unparseable = stillMissing.filter((t) => {
    const staged = overlay.get(t.id);
    return !staged?.mepRate || !staged.cclRate;
  });
  if (unparseable.length > 0) {
    log(`\n  ! ${String(unparseable.length)} transaction(s) still have no rate snapshot.`);
    log("  The replay refuses to run on these — re-run once the rate API is reachable:");
    for (const t of unparseable.slice(0, 10)) {
      log(`      ${t.id}  ${t.transactedAt.toISOString().slice(0, 10)}`);
    }
  }
}

async function main() {
  log(dryRun ? "DRY RUN — no writes will be made\n" : "Applying currency backfill\n");

  // Fail early on a currency the contract doesn't know, rather than midway
  // through with some holdings rebuilt and others not.
  const currencies = await prisma.transaction.findMany({ select: { currency: true }, distinct: ["currency"] });
  for (const { currency } of currencies) currencySchema.parse(currency);

  log("1. Rate snapshots");
  const rates = await backfillRates();

  log("\n2. Restoring peso prices");
  const restored = await restorePesoPrices();

  log("\n3. Rebuilding holdings");
  const { rebuilt, approximated } = await rebuildHoldings();

  await reportManualReview();

  log(
    `\nDone. ${String(rates)} rate snapshot(s), ${String(restored)} price(s) restored, ` +
      `${String(rebuilt)} holding(s) rebuilt${approximated > 0 ? `, ${String(approximated)} with an approximated imported base` : ""}.`,
  );
  if (dryRun) log("Nothing was written. Re-run without --dry-run to apply.");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
