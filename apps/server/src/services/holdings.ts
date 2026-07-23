import { Prisma } from "@prisma/client";
import { HttpError } from "../http-error.js";

export const ZERO = new Prisma.Decimal(0);

// Quantities below the stored Decimal(18,8) precision are rounding residue, not a
// real position — treat anything smaller as zero so a rebuild can't leave a dead
// holding alive.
export const QTY_EPSILON = new Prisma.Decimal("1e-8");

export interface ReplayTransaction {
  id: string;
  type: string;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  fee: Prisma.Decimal;
}

export interface PositionState {
  quantity: Prisma.Decimal;
  value: Prisma.Decimal;
}

/**
 * Replays BUY/SELL transactions in (quantity, value) space, where `value` is the
 * total cost basis (avgCostBasis * quantity). A BUY adds price*qty + fee; a SELL
 * removes shares at the running average (value drops proportionally, so the
 * average is unchanged). Pure — no DB access.
 */
export function replayPosition(transactions: ReplayTransaction[]): PositionState {
  let quantity = ZERO;
  let value = ZERO;
  for (const t of transactions) {
    if (t.type === "BUY") {
      quantity = quantity.plus(t.quantity);
      value = value.plus(t.quantity.times(t.price)).plus(t.fee);
    } else {
      const avg = quantity.gt(0) ? value.div(quantity) : ZERO;
      const sold = Prisma.Decimal.min(t.quantity, quantity);
      quantity = Prisma.Decimal.max(ZERO, quantity.minus(t.quantity));
      value = Prisma.Decimal.max(ZERO, value.minus(sold.times(avg)));
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

export interface RebuildInput {
  /** Current stored holding, or null when none exists. */
  holding: { quantity: Prisma.Decimal; avgCostBasis: Prisma.Decimal } | null;
  /** Transactions counted toward the base residual (what the holding "explains"). */
  explained: ReplayTransaction[];
  /** Transactions replayed chronologically to produce the new state. */
  rebuilt: ReplayTransaction[];
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
export function computeRebuild(input: RebuildInput): { quantity: Prisma.Decimal; avgCostBasis: Prisma.Decimal } | null {
  const explained = replayPosition(input.explained);
  const rebuilt = replayPosition(input.rebuilt);

  // The portion of the current holding not explained by its transactions (an
  // imported base, or ~0 for a transaction-built holding). Drop sub-precision
  // residue so it can't survive.
  const holdingQty = input.holding?.quantity ?? ZERO;
  const holdingValue = holdingQty.times(input.holding?.avgCostBasis ?? ZERO);
  let baseQty = holdingQty.minus(explained.quantity);
  let baseValue = holdingValue.minus(explained.value);
  if (baseQty.abs().lt(QTY_EPSILON)) {
    baseQty = ZERO;
    baseValue = ZERO;
  }

  const newQty = baseQty.plus(rebuilt.quantity);
  if (newQty.lt(QTY_EPSILON)) return null;

  return { quantity: newQty, avgCostBasis: baseValue.plus(rebuilt.value).div(newQty) };
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
  const transactions = await tx.transaction.findMany({
    where: { portfolioId, assetId, type: { in: ["BUY", "SELL"] } },
    orderBy: [{ transactedAt: "asc" }, { createdAt: "asc" }],
  });

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
function computeBaseQuantity(
  holding: { quantity: Prisma.Decimal; avgCostBasis: Prisma.Decimal } | null,
  explained: ReplayTransaction[],
): Prisma.Decimal {
  const explainedQty = replayPosition(explained).quantity;
  const baseQty = (holding?.quantity ?? ZERO).minus(explainedQty);
  return baseQty.abs().lt(QTY_EPSILON) ? ZERO : baseQty;
}
