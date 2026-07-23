import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fetchQuote, toUsdTicker } from "../services/yahoo-finance";
import getMepRate from "../services/mep";
import { HttpError } from "../http-error";

// #1 — Schemas drive both runtime validation and the inferred TS types.
const portfolioParams = z.object({ id: z.uuid() });
const transactionParams = z.object({ id: z.uuid(), txId: z.uuid() });

const createPortfolioBody = z.object({
  name: z.string().min(1),
});

const createTransactionBody = z.object({
  ticker: z.string().min(1),
  // Accept any casing from the client, validate against the known set.
  type: z.preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), z.enum(["BUY", "SELL", "DIVIDEND", "FEE"])),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  currency: z.string().min(1),
  // A bare YYYY-MM-DD (from <input type="date">) is anchored at noon UTC so the
  // calendar day can't shift under any timezone (UTC-11..+12); anything else
  // falls through to normal date coercion/validation. (Rows created before this
  // fix are anchored at 20:00 UTC — same calendar day in UTC, so replay ordering
  // across days is unaffected.)
  transactedAt: z.preprocess(
    (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00.000Z`) : v),
    z.coerce.date(),
  ),
  fee: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

// Edits accept the same fields plus an optional target portfolio — supplying a
// different id moves the transaction (and its holding effect) between portfolios.
const updateTransactionBody = createTransactionBody.extend({
  portfolioId: z.uuid().optional(),
});

// Response schemas keep handlers from leaking whole DB rows by default (a future
// sensitive column stays server-side unless explicitly added here). Decimal
// columns serialize as strings to preserve precision; Dates stringify to ISO.
const decimalString = z.instanceof(Prisma.Decimal).transform((d) => d.toString());

const errorResponse = z.object({ error: z.string() });

const portfolioResponse = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  currency: z.string(),
  isDefault: z.boolean(),
  createdAt: z.date(),
});

const holdingResponse = z.object({
  id: z.uuid(),
  portfolioId: z.uuid(),
  assetId: z.uuid(),
  quantity: decimalString,
  avgCostBasis: decimalString,
  createdAt: z.date(),
  updatedAt: z.date(),
  asset: z.object({
    ticker: z.string(),
    name: z.string(),
    currency: z.string(),
    assetType: z.string(),
  }),
});

const transactionResponse = z.object({
  id: z.uuid(),
  portfolioId: z.uuid(),
  assetId: z.uuid(),
  type: z.string(),
  quantity: decimalString,
  price: decimalString,
  fee: decimalString,
  currency: z.string(),
  transactedAt: z.date(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  asset: z.object({ ticker: z.string(), name: z.string() }),
});

const portfoliosRoutes: FastifyPluginAsync = async (fastify) => {
  // Opt this plugin's routes into Zod-typed request/reply inference.
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Resolves the asset a transaction points at, applying the CEDEAR ARS→USD
  // conversion and creating the Asset row on first sight. Shared by create/edit
  // so both normalize tickers and amounts identically.
  //
  // This runs before the holding $transaction because it may hit the network
  // (Yahoo, MEP rate). Known tradeoff: if the later transaction fails, a
  // just-created Asset row survives as an orphan — harmless, and it will be
  // reused the next time the ticker appears.
  async function resolveAsset(input: { ticker: string; price: number; currency: string; fee?: number; transactedAt: Date }) {
    let { ticker, price, currency, fee } = input;

    // CEDEARs are stored in USD. When logged in ARS against a peso ticker
    // (e.g. SPY.BA), convert price/fee to the USD `D` variant (SPYD.BA) using
    // the dólar MEP implied by the pair at the trade date.
    const usdTicker = toUsdTicker(ticker);
    if (currency.toUpperCase() === "ARS" && usdTicker !== ticker) {
      const mep = await getMepRate(input.transactedAt);
      price /= mep;
      if (fee) fee /= mep;
      ticker = usdTicker;
      currency = "USD";
    }

    let asset = await app.prisma.asset.findFirst({ where: { ticker } });
    if (!asset) {
      let data: Prisma.AssetCreateInput;
      try {
        const quote = await fetchQuote(ticker);
        data = {
          ticker,
          name: quote.name,
          assetType: quote.quoteType,
          exchange: quote.exchange ?? "",
          currency: quote.currency,
        };
      } catch {
        // Yahoo lookup failed — register a minimal placeholder asset.
        data = { ticker, name: ticker, assetType: "EQUITY", currency };
      }

      try {
        asset = await app.prisma.asset.create({ data });
      } catch (error) {
        // Lost a create race: another request inserted the same (ticker, exchange)
        // first — use its row instead of failing.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          asset = await app.prisma.asset.findFirst({ where: { ticker } });
        }
        if (!asset) throw error;
      }
    }

    return { asset, price, currency, fee: fee ?? 0 };
  }

  // #2 — `app.authenticate` runs first and sets `request.userId`.
  // #3 — `app.prisma` is the decorated shared client (no direct import).
  app.get("/portfolios", { preHandler: app.authenticate, schema: { response: { 200: z.array(portfolioResponse) } } }, async (request) =>
    app.prisma.portfolio.findMany({
      where: { userId: request.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  );

  app.post(
    "/portfolios",
    {
      preHandler: app.authenticate,
      schema: { body: createPortfolioBody, response: { 201: portfolioResponse } },
    },
    async (request, reply) => {
      const { name } = request.body; // typed as string, already validated

      // count + create must be atomic or two concurrent "first portfolio"
      // requests both become the default. Serializable isolation makes one of
      // them abort (P2034); retry it — the rerun sees the winner's row.
      const createWithDefaultFlag = () =>
        app.prisma.$transaction(
          async (tx) => {
            const existingCount = await tx.portfolio.count({
              where: { userId: request.userId },
            });
            return tx.portfolio.create({
              data: { userId: request.userId, name, isDefault: existingCount === 0 },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

      let portfolio;
      try {
        portfolio = await createWithDefaultFlag();
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
          throw error;
        }
        portfolio = await createWithDefaultFlag();
      }
      return reply.status(201).send(portfolio);
    },
  );

  app.get(
    "/portfolios/:id/holdings",
    { preHandler: app.authenticate, schema: { params: portfolioParams, response: { 200: z.array(holdingResponse), 404: errorResponse } } },
    async (request, reply) => {
      const portfolio = await app.prisma.portfolio.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!portfolio) {
        return reply.status(404).send({ error: "Portfolio not found" });
      }

      return app.prisma.holding.findMany({
        where: { portfolioId: request.params.id },
        include: {
          asset: {
            select: {
              ticker: true,
              name: true,
              currency: true,
              assetType: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    },
  );

  app.get(
    "/portfolios/:id/transactions",
    {
      preHandler: app.authenticate,
      schema: { params: portfolioParams, response: { 200: z.array(transactionResponse), 404: errorResponse } },
    },
    async (request, reply) => {
      const portfolio = await app.prisma.portfolio.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!portfolio) {
        return reply.status(404).send({ error: "Portfolio not found" });
      }

      return app.prisma.transaction.findMany({
        where: { portfolioId: request.params.id },
        include: { asset: { select: { ticker: true, name: true } } },
        orderBy: [{ transactedAt: "desc" }, { createdAt: "desc" }],
      });
    },
  );

  app.post(
    "/portfolios/:id/transactions",
    {
      preHandler: app.authenticate,
      schema: { params: portfolioParams, body: createTransactionBody, response: { 201: transactionResponse, 404: errorResponse } },
    },
    async (request, reply) => {
      const portfolio = await app.prisma.portfolio.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!portfolio) {
        return reply.status(404).send({ error: "Portfolio not found" });
      }

      const { type, quantity, transactedAt, notes } = request.body;
      const {
        asset,
        price,
        currency,
        fee: txFee,
      } = await resolveAsset({
        ticker: request.body.ticker,
        price: request.body.price,
        currency: request.body.currency,
        fee: request.body.fee,
        transactedAt,
      });

      const assetId = asset.id;

      // Record the transaction and move the holding atomically.
      const created = await app.prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            portfolioId: request.params.id,
            assetId,
            type, // already normalized to uppercase by the schema
            quantity,
            price,
            currency,
            fee: txFee,
            notes,
            transactedAt, // already a Date via z.coerce.date()
          },
          include: { asset: { select: { ticker: true, name: true } } },
        });

        // Only buys and sells move the position; dividends/fees leave it alone.
        if (type === "BUY" || type === "SELL") {
          await updateHolding(tx, request.params.id, assetId, type, quantity, price, txFee);
        }

        return transaction;
      });
      return reply.status(201).send(created);
    },
  );

  app.patch(
    "/portfolios/:id/transactions/:txId",
    {
      preHandler: app.authenticate,
      schema: { params: transactionParams, body: updateTransactionBody, response: { 200: transactionResponse, 404: errorResponse } },
    },
    async (request, reply) => {
      const portfolio = await app.prisma.portfolio.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!portfolio) {
        return reply.status(404).send({ error: "Portfolio not found" });
      }

      const existing = await app.prisma.transaction.findFirst({
        where: { id: request.params.txId, portfolioId: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Transaction not found" });
      }

      // An edit may move the transaction to another of the user's portfolios.
      const targetPortfolioId = request.body.portfolioId ?? request.params.id;
      if (targetPortfolioId !== request.params.id) {
        const target = await app.prisma.portfolio.findFirst({
          where: { id: targetPortfolioId, userId: request.userId },
        });
        if (!target) {
          return reply.status(404).send({ error: "Target portfolio not found" });
        }
      }

      const { type, quantity, transactedAt, notes } = request.body;
      const { asset, price, currency, fee } = await resolveAsset({
        ticker: request.body.ticker,
        price: request.body.price,
        currency: request.body.currency,
        fee: request.body.fee,
        transactedAt,
      });

      // Edit as remove-then-reapply: rebuild the old holding without this
      // transaction (using its pre-edit asset/portfolio/values, still in the DB),
      // persist the new values, then rebuild the target holding with a full
      // chronological replay. Replaying — rather than appending the edited values
      // last — keeps average-cost math correct when the edit is backdated before
      // existing sells. This naturally handles ticker, portfolio, and amount
      // changes in one atomic step.
      return app.prisma.$transaction(async (tx) => {
        await recomputeHolding(tx, existing.portfolioId, existing.assetId, { excludeFromReplay: existing.id });

        const updated = await tx.transaction.update({
          where: { id: existing.id },
          data: {
            portfolioId: targetPortfolioId,
            assetId: asset.id,
            type,
            quantity,
            price,
            currency,
            fee,
            notes,
            transactedAt,
          },
          include: { asset: { select: { ticker: true, name: true } } },
        });

        // Only buys and sells move the position; dividends/fees leave it alone.
        if (type === "BUY" || type === "SELL") {
          await recomputeHolding(tx, targetPortfolioId, asset.id, { excludeFromBase: existing.id });
        }

        return updated;
      });
    },
  );

  app.delete(
    "/portfolios/:id/transactions/:txId",
    { preHandler: app.authenticate, schema: { params: transactionParams } },
    async (request, reply) => {
      const portfolio = await app.prisma.portfolio.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });

      if (!portfolio) {
        return reply.status(404).send({ error: "Portfolio not found" });
      }

      const transaction = await app.prisma.transaction.findFirst({
        where: { id: request.params.txId, portfolioId: request.params.id },
      });

      if (!transaction) {
        return reply.status(404).send({ error: "Transaction not found" });
      }

      // Delete and rebuild the affected holding atomically.
      await app.prisma.$transaction(async (tx) => {
        await recomputeHolding(tx, request.params.id, transaction.assetId, { excludeFromReplay: transaction.id });
        await tx.transaction.delete({ where: { id: transaction.id } });
      });

      return reply.status(204).send();
    },
  );
};

export default portfoliosRoutes;

const ZERO = new Prisma.Decimal(0);

// Quantities below the stored Decimal(18,8) precision are rounding residue, not a
// real position — treat anything smaller as zero so a rebuild can't leave a dead
// holding alive.
const QTY_EPSILON = new Prisma.Decimal("1e-8");

// Serializes concurrent read-modify-write cycles on one (portfolio, asset)
// holding: without the row lock, two parallel transactions both read the same
// starting quantity and the second write silently overwrites the first.
// Locking a row that doesn't exist yet is a no-op; the @@unique constraint
// still catches double-creates.
async function lockHolding(tx: Prisma.TransactionClient, portfolioId: string, assetId: string) {
  await tx.$executeRaw`SELECT id FROM holdings WHERE portfolio_id = ${portfolioId}::uuid AND asset_id = ${assetId}::uuid FOR UPDATE`;
}

// Weighted-average-cost holding update. A BUY blends the trade price (plus fee)
// into avgCostBasis; a SELL reduces quantity at the existing average, closing the
// position when it reaches zero. All arithmetic is done in Decimal — money must
// never touch binary floats. Quantities/prices are already in the asset's currency.
async function updateHolding(
  tx: Prisma.TransactionClient,
  portfolioId: string,
  assetId: string,
  type: "BUY" | "SELL",
  quantity: number,
  price: number,
  fee: number,
) {
  await lockHolding(tx, portfolioId, assetId);

  // JS numbers convert exactly via their decimal string representation.
  const qty = new Prisma.Decimal(quantity);
  const cost = qty.times(new Prisma.Decimal(price)).plus(new Prisma.Decimal(fee));

  const existing = await tx.holding.findUnique({
    where: { portfolioId_assetId: { portfolioId, assetId } },
  });

  if (type === "BUY") {
    if (!existing) {
      await tx.holding.create({
        data: {
          portfolioId,
          assetId,
          quantity: qty,
          avgCostBasis: cost.div(qty),
        },
      });
      return;
    }

    const oldValue = existing.quantity.times(existing.avgCostBasis);
    const newQty = existing.quantity.plus(qty);
    await tx.holding.update({
      where: { id: existing.id },
      data: {
        quantity: newQty,
        avgCostBasis: oldValue.plus(cost).div(newQty),
      },
    });
    return;
  }

  // SELL — reject oversells instead of silently vaporizing the position (the
  // transaction row would still be recorded, so the excess would just vanish).
  if (!existing || qty.gt(existing.quantity)) {
    throw new HttpError(422, "Cannot sell more than the currently held quantity");
  }

  const newQty = existing.quantity.minus(qty);
  if (newQty.lt(QTY_EPSILON)) {
    // Position fully closed: drop the row.
    await tx.holding.delete({ where: { id: existing.id } });
    return;
  }

  // avgCostBasis is unchanged on a sell; only the share count drops.
  await tx.holding.update({
    where: { id: existing.id },
    data: { quantity: newQty },
  });
}

// Replays BUY/SELL transactions in (quantity, value) space, where `value` is the total
// cost basis (avgCostBasis * quantity). A BUY adds price*qty + fee; a SELL removes shares
// at the running average (value drops proportionally, so the average is unchanged).
function replayPosition(
  transactions: {
    type: string;
    quantity: Prisma.Decimal;
    price: Prisma.Decimal;
    fee: Prisma.Decimal;
  }[],
): { quantity: Prisma.Decimal; value: Prisma.Decimal } {
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

// Rebuilds a holding from a full chronological replay of its transactions. A holding's
// quantity is the sum of an optional imported base (from scripts/import-portfolio.ts,
// with no backing transactions) and everything its BUY/SELL transactions added. We
// recover that base as the residual `holding − replay(explained)`, then rebuild as
// `base + replay(rebuilt)`. So a purely transaction-built holding (base ≈ 0) is removed
// once its last transaction is gone, while an imported base survives. Replaying — rather
// than reversing in place — is required because an average-cost update loses the
// per-lot history needed to undo it.
//
// The two exclusion modes cover the callers' timing relative to the holding's state:
// - `excludeFromReplay`: the transaction is still in the DB and reflected in the holding
//   (delete, or the removal half of an edit) — it counts toward the residual but is
//   dropped from the rebuild.
// - `excludeFromBase`: the transaction is in the DB but NOT yet reflected in the holding
//   (the reapply half of an edit, after the removal pass) — the residual is computed
//   without it, and the rebuild replays everything chronologically.
async function recomputeHolding(
  tx: Prisma.TransactionClient,
  portfolioId: string,
  assetId: string,
  opts: { excludeFromReplay?: string; excludeFromBase?: string },
) {
  await lockHolding(tx, portfolioId, assetId);

  // createdAt breaks ties between same-day trades (bare dates are anchored at a fixed
  // UTC time), so the replay matches the order the position was built in.
  const transactions = await tx.transaction.findMany({
    where: { portfolioId, assetId, type: { in: ["BUY", "SELL"] } },
    orderBy: [{ transactedAt: "asc" }, { createdAt: "asc" }],
  });

  const existing = await tx.holding.findUnique({
    where: { portfolioId_assetId: { portfolioId, assetId } },
  });

  const explained = replayPosition(transactions.filter((t) => t.id !== opts.excludeFromBase));
  const rebuilt = replayPosition(transactions.filter((t) => t.id !== opts.excludeFromReplay));

  // The portion of the current holding not explained by its transactions (an imported base,
  // or ~0 for a transaction-built holding). Drop sub-precision residue so it can't survive.
  const holdingQty = existing?.quantity ?? ZERO;
  const holdingValue = holdingQty.times(existing?.avgCostBasis ?? ZERO);
  let baseQty = holdingQty.minus(explained.quantity);
  let baseValue = holdingValue.minus(explained.value);
  if (baseQty.abs().lt(QTY_EPSILON)) {
    baseQty = ZERO;
    baseValue = ZERO;
  }

  const newQty = baseQty.plus(rebuilt.quantity);

  // Nothing left once the base and remaining transactions are combined: drop the row.
  if (newQty.lt(QTY_EPSILON)) {
    if (existing) await tx.holding.delete({ where: { id: existing.id } });
    return;
  }

  const avgCostBasis = baseValue.plus(rebuilt.value).div(newQty);

  if (existing) {
    await tx.holding.update({
      where: { id: existing.id },
      data: { quantity: newQty, avgCostBasis },
    });
  } else {
    await tx.holding.create({
      data: { portfolioId, assetId, quantity: newQty, avgCostBasis },
    });
  }
}
