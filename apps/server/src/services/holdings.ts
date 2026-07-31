import { Prisma } from "@prisma/client";
import { HttpError } from "../http-error.js";
import { addMoney, mapMoney, scaleMoney, toMoney, ZERO_MONEY, type Money } from "./currency.js";
import { currencySchema } from "@repo/api-contract";

export const ZERO = new Prisma.Decimal(0);

// Quantities below the stored Decimal(18,8) precision are rounding residue, not a
// real position — treat anything smaller as zero so a rebuild can't leave a dead
// holding alive.
export const QTY_EPSILON = new Prisma.Decimal("1e-8");

export interface ReplayTransaction {
  id: string;
  type: "BUY" | "SELL";
  quantity: Prisma.Decimal;
  /** Per-share price, expressed in all three currencies. */
  price: Money;
  /** Absolute fee, expressed in all three currencies. */
  fee: Money;
}

export interface PositionState {
  quantity: Prisma.Decimal;
  value: Money;
}

/**
 * Replays BUY/SELL transactions in (quantity, value) space, where `value` is the
 * total cost basis (avgCostBasis * quantity) carried in all three currencies at
 * once. A BUY adds price*qty + fee; a SELL removes shares at the running average
 * (value drops proportionally, so the average is unchanged).
 *
 * The three currencies are independent accumulators over a shared quantity —
 * each holds the real amount transacted in that currency, so the ARS basis is
 * the pesos actually spent rather than the dollar basis marked at today's rate.
 * Pure — no DB access.
 */
export function replayPosition(transactions: ReplayTransaction[]): PositionState {
  let quantity = ZERO;
  let value = ZERO_MONEY;
  for (const t of transactions) {
    if (t.type === "BUY") {
      quantity = quantity.plus(t.quantity);
      value = addMoney(value, addMoney(scaleMoney(t.price, t.quantity), t.fee));
    } else {
      // Compute against the pre-sale quantity: the running average and the
      // number of shares actually sold both depend on it.
      const priorQuantity = quantity;
      const sold = Prisma.Decimal.min(t.quantity, priorQuantity);
      quantity = Prisma.Decimal.max(ZERO, priorQuantity.minus(t.quantity));
      value = mapMoney(value, (v) => {
        const avg = priorQuantity.gt(0) ? v.div(priorQuantity) : ZERO;
        return Prisma.Decimal.max(ZERO, v.minus(sold.times(avg)));
      });
    }
  }
  return { quantity, value };
}

/**
 * True when processing `candidateId` inside the chronologically ordered replay
 * would drive the position negative — i.e. that SELL exceeds what is held *at
 * its point in history*, base position included. Other (pre-existing) dips are
 * ignored so legacy data can't block unrelated new transactions. Pure.
 */
export function sellOverdrawsAt(orderedTransactions: ReplayTransaction[], candidateId: string, baseQuantity: Prisma.Decimal): boolean {
  let qty = baseQuantity;
  for (const t of orderedTransactions) {
    qty = t.type === "BUY" ? qty.plus(t.quantity) : qty.minus(t.quantity);
    if (t.id === candidateId && qty.lt(QTY_EPSILON.neg())) return true;
    // Clamp like replayPosition so subsequent steps mirror stored behavior.
    if (qty.lt(ZERO)) qty = ZERO;
  }
  return false;
}

/** A holding's stored cost basis across the three currencies. */
export interface HoldingBases {
  quantity: Prisma.Decimal;
  avgCostBasis: Prisma.Decimal;
  avgCostBasisArs: Prisma.Decimal;
  avgCostBasisCcl: Prisma.Decimal;
}

export interface RebuildInput {
  /** Current stored holding, or null when none exists. */
  holding: HoldingBases | null;
  /** Transactions counted toward the base residual (what the holding "explains"). */
  explained: ReplayTransaction[];
  /** Transactions replayed chronologically to produce the new state. */
  rebuilt: ReplayTransaction[];
}

function holdingValue(holding: HoldingBases | null): Money {
  if (!holding) return ZERO_MONEY;
  return {
    mep: holding.quantity.times(holding.avgCostBasis),
    ars: holding.quantity.times(holding.avgCostBasisArs),
    ccl: holding.quantity.times(holding.avgCostBasisCcl),
  };
}

/**
 * Core rebuild math, pure and DB-free. A holding's quantity is the sum of an
 * optional imported base (from scripts/import-portfolio.ts, with no backing
 * transactions) and everything its BUY/SELL transactions added. We recover that
 * base as the residual `holding − replay(explained)`, then rebuild as
 * `base + replay(rebuilt)`. A purely transaction-built holding (base ≈ 0) is
 * removed once its last transaction is gone, while an imported base survives.
 *
 * Returns the new holding values, or null when the position is empty (delete).
 */
export function computeRebuild(input: RebuildInput): HoldingBases | null {
  const explained = replayPosition(input.explained);
  const rebuilt = replayPosition(input.rebuilt);

  // The portion of the current holding not explained by its transactions (an
  // imported base, or ~0 for a transaction-built holding). Drop sub-precision
  // residue so it can't survive. Quantity is currency-independent, so one
  // epsilon check governs all three value columns.
  const holdingQty = input.holding?.quantity ?? ZERO;
  let baseQty = holdingQty.minus(explained.quantity);
  let baseValue = addMoney(
    holdingValue(input.holding),
    mapMoney(explained.value, (v) => v.neg()),
  );
  if (baseQty.abs().lt(QTY_EPSILON)) {
    baseQty = ZERO;
    baseValue = ZERO_MONEY;
  }

  const newQty = baseQty.plus(rebuilt.quantity);
  if (newQty.lt(QTY_EPSILON)) return null;

  const total = addMoney(baseValue, rebuilt.value);
  return {
    quantity: newQty,
    avgCostBasis: total.mep.div(newQty),
    avgCostBasisArs: total.ars.div(newQty),
    avgCostBasisCcl: total.ccl.div(newQty),
  };
}

/**
 * Serializes concurrent read-modify-write cycles on one (portfolio, asset)
 * holding: without the row lock, two parallel transactions both read the same
 * starting quantity and the second write silently overwrites the first.
 * Locking a row that doesn't exist yet is a no-op; the @@unique constraint
 * still catches double-creates.
 */
async function lockHolding(tx: Prisma.TransactionClient, portfolioId: string, assetId: string) {
  await tx.$executeRaw`SELECT id FROM holdings WHERE portfolio_id = ${portfolioId}::uuid AND asset_id = ${assetId}::uuid FOR UPDATE`;
}

/** The stored transaction fields the replay needs to derive its three currencies. */
export interface StoredTransaction {
  id: string;
  type: Prisma.TransactionCreateInput["type"];
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  fee: Prisma.Decimal;
  currency: string;
  mepRate: Prisma.Decimal | null;
  cclRate: Prisma.Decimal | null;
}

/**
 * Convert a stored row into its three-currency replay form.
 *
 * A missing rate snapshot is an operational error, not a runtime path: the
 * backfill populates every historical row and every new write records both
 * rates. Guessing here would silently corrupt a cost basis, so name the row and
 * stop instead.
 */
export function toReplayTransaction(t: StoredTransaction): ReplayTransaction {
  if (t.mepRate === null || t.cclRate === null) {
    throw new Error(
      `Transaction ${t.id} is missing its FX rate snapshot (mepRate=${String(t.mepRate)}, cclRate=${String(t.cclRate)}). ` +
        `Run 'pnpm --filter server backfill-currency' to populate historical rates.`,
    );
  }
  const currency = currencySchema.parse(t.currency);
  const rates = { mepRate: t.mepRate, cclRate: t.cclRate };
  return {
    id: t.id,
    type: t.type === "SELL" ? "SELL" : "BUY",
    quantity: t.quantity,
    price: toMoney(t.price, currency, rates),
    fee: toMoney(t.fee, currency, rates),
  };
}

export interface RecomputeOptions {
  /**
   * The transaction is still in the DB and reflected in the holding (delete, or
   * the removal half of an edit) — it counts toward the residual but is dropped
   * from the rebuild.
   */
  excludeFromReplay?: string;
  /**
   * The transaction is in the DB but NOT yet reflected in the holding (a just-
   * created row, or the reapply half of an edit) — the residual is computed
   * without it, and the rebuild replays everything chronologically.
   */
  excludeFromBase?: string;
  /**
   * When set (to a transaction id being applied), reject with 422 if that SELL
   * exceeds the position held at its chronological point — instead of the
   * replay silently clamping it to zero.
   */
  rejectOversellFor?: string;
}

/**
 * Rebuilds a holding from a full chronological replay of its transactions.
 * Replaying — rather than reversing in place — is required because an
 * average-cost update loses the per-lot history needed to undo it.
 */
export async function recomputeHolding(tx: Prisma.TransactionClient, portfolioId: string, assetId: string, opts: RecomputeOptions) {
  await lockHolding(tx, portfolioId, assetId);

  // createdAt breaks ties between same-day trades (bare dates are anchored at a
  // fixed UTC time), so the replay matches the order the position was built in.
  const rows = await tx.transaction.findMany({
    where: { portfolioId, assetId, type: { in: ["BUY", "SELL"] } },
    orderBy: [{ transactedAt: "asc" }, { createdAt: "asc" }],
  });
  const transactions = rows.map(toReplayTransaction);

  const existing = await tx.holding.findUnique({
    where: { portfolioId_assetId: { portfolioId, assetId } },
  });

  const explained = transactions.filter((t) => t.id !== opts.excludeFromBase);
  const rebuilt = transactions.filter((t) => t.id !== opts.excludeFromReplay);

  if (opts.rejectOversellFor) {
    const base = computeBaseQuantity(existing, explained);
    if (sellOverdrawsAt(rebuilt, opts.rejectOversellFor, base)) {
      throw new HttpError(422, "Cannot sell more than the quantity held at that date");
    }
  }

  const result = computeRebuild({ holding: existing, explained, rebuilt });

  // Nothing left once the base and remaining transactions are combined: drop the row.
  if (result === null) {
    if (existing) await tx.holding.delete({ where: { id: existing.id } });
    return;
  }

  if (existing) {
    await tx.holding.update({
      where: { id: existing.id },
      data: result,
    });
  } else {
    await tx.holding.create({
      data: { portfolioId, assetId, ...result },
    });
  }
}

// Base residual quantity (imported shares not explained by transactions),
// mirroring computeRebuild's epsilon handling.
function computeBaseQuantity(holding: { quantity: Prisma.Decimal } | null, explained: ReplayTransaction[]): Prisma.Decimal {
  const explainedQty = replayPosition(explained).quantity;
  const baseQty = (holding?.quantity ?? ZERO).minus(explainedQty);
  return baseQty.abs().lt(QTY_EPSILON) ? ZERO : baseQty;
}
