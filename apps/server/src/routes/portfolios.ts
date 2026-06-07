import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fetchQuote, toUsdTicker } from "../services/yahoo-finance.js";
import getMepRate from "../services/mep.js";

// #1 — Schemas drive both runtime validation and the inferred TS types.
const portfolioParams = z.object({ id: z.uuid() });
const transactionParams = z.object({ id: z.uuid(), txId: z.uuid() });

const createPortfolioBody = z.object({
  name: z.string().min(1),
});

const createTransactionBody = z.object({
  ticker: z.string().min(1),
  // Accept any casing from the client, validate against the known set.
  type: z.preprocess(
    (v) => (typeof v === "string" ? v.toUpperCase() : v),
    z.enum(["BUY", "SELL", "DIVIDEND", "FEE"])
  ),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  currency: z.string().min(1),
  // A bare YYYY-MM-DD (from <input type="date">) is anchored at noon UTC so the
  // calendar day can't shift under any timezone (UTC-11..+12); anything else
  // falls through to normal date coercion/validation.
  transactedAt: z.preprocess(
    (v) =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? new Date(`${v}T20:00:00.000Z`)
        : v,
    z.coerce.date()
  ),
  fee: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const portfoliosRoutes: FastifyPluginAsync = async (fastify) => {
  // Opt this plugin's routes into Zod-typed request/reply inference.
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // #2 — `app.authenticate` runs first and sets `request.userId`.
  // #3 — `app.prisma` is the decorated shared client (no direct import).
  app.get("/portfolios", { preHandler: app.authenticate }, async (request) =>
    app.prisma.portfolio.findMany({
      where: { userId: request.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    })
  );

  app.post(
    "/portfolios",
    { preHandler: app.authenticate, schema: { body: createPortfolioBody } },
    async (request) => {
      const { name } = request.body; // typed as string, already validated
      const existingCount = await app.prisma.portfolio.count({
        where: { userId: request.userId },
      });

      return app.prisma.portfolio.create({
        data: { userId: request.userId, name, isDefault: existingCount === 0 },
      });
    }
  );

  app.get(
    "/portfolios/:id/holdings",
    { preHandler: app.authenticate, schema: { params: portfolioParams } },
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
          asset: { select: { ticker: true, name: true, currency: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }
  );

  app.get(
    "/portfolios/:id/transactions",
    { preHandler: app.authenticate, schema: { params: portfolioParams } },
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
    }
  );

  app.post(
    "/portfolios/:id/transactions",
    {
      preHandler: app.authenticate,
      schema: { params: portfolioParams, body: createTransactionBody },
    },
    async (request, reply) => {
      const portfolio = await app.prisma.portfolio.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!portfolio) {
        return reply.status(404).send({ error: "Portfolio not found" });
      }

      const { type, quantity, transactedAt, notes } = request.body;
      let { ticker, price, currency, fee } = request.body;

      // CEDEARs are stored in USD. When logged in ARS against a peso ticker
      // (e.g. SPY.BA), convert price/fee to the USD `D` variant (SPYD.BA) using
      // the dólar MEP implied by the pair at the trade date.
      const usdTicker = toUsdTicker(ticker);
      if (currency.toUpperCase() === "ARS" && usdTicker !== ticker) {
        const mep = await getMepRate(transactedAt);
        price = price / mep;
        if (fee) fee = fee / mep;
        ticker = usdTicker;
        currency = "USD";
      }

      let asset = await app.prisma.asset.findFirst({ where: { ticker } });
      if (!asset) {
        try {
          const quote = await fetchQuote(ticker);
          asset = await app.prisma.asset.create({
            data: {
              ticker,
              name: quote.name,
              assetType: quote.quoteType,
              exchange: quote.exchange,
              currency: quote.currency,
            },
          });
        } catch {
          asset = await app.prisma.asset.create({
            data: { ticker, name: ticker, assetType: "EQUITY", currency },
          });
        }
      }

      const assetId = asset.id;
      const txFee = fee ?? 0;

      // Record the transaction and move the holding atomically.
      return app.prisma.$transaction(async (tx) => {
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
    }
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
        await recomputeHolding(tx, request.params.id, transaction.assetId);
        await tx.transaction.delete({ where: { id: transaction.id } });
      });

      return reply.status(204).send();
    }
  );
};

export default portfoliosRoutes;

// Weighted-average-cost holding update. A BUY blends the trade price (plus fee)
// into avgCostBasis; a SELL reduces quantity at the existing average, closing the
// position when it reaches zero. Quantities/prices are already in the asset's currency.
async function updateHolding(
  tx: Prisma.TransactionClient,
  portfolioId: string,
  assetId: string,
  type: "BUY" | "SELL",
  quantity: number,
  price: number,
  fee: number
) {
  const existing = await tx.holding.findUnique({
    where: { portfolioId_assetId: { portfolioId, assetId } },
  });

  if (type === "BUY") {
    if (!existing) {
      await tx.holding.create({
        data: {
          portfolioId,
          assetId,
          quantity,
          avgCostBasis: (quantity * price + fee) / quantity,
        },
      });
      return;
    }

    const oldQty = Number(existing.quantity);
    const oldAvg = Number(existing.avgCostBasis);
    const newQty = oldQty + quantity;
    await tx.holding.update({
      where: { id: existing.id },
      data: {
        quantity: newQty,
        avgCostBasis: (oldQty * oldAvg + quantity * price + fee) / newQty,
      },
    });
    return;
  }

  // SELL — nothing held means nothing to reduce.
  if (!existing) return;

  const newQty = Number(existing.quantity) - quantity;
  if (newQty <= 0) {
    // Position fully closed (or oversold): drop the row.
    await tx.holding.delete({ where: { id: existing.id } });
    return;
  }

  // avgCostBasis is unchanged on a sell; only the share count drops.
  await tx.holding.update({
    where: { id: existing.id },
    data: { quantity: newQty },
  });
}

// Rebuilds a holding from scratch by replaying its remaining BUY/SELL transactions
// in chronological order. Used after a delete, since an average-cost update can't be
// reversed in place (the average loses the per-lot history needed to undo it).
async function recomputeHolding(
  tx: Prisma.TransactionClient,
  portfolioId: string,
  assetId: string
) {
  const transactions = await tx.transaction.findMany({
    where: { portfolioId, assetId, type: { in: ["BUY", "SELL"] } },
    // createdAt breaks ties between same-day trades (all anchored at 20:00 UTC),
    // so the replay matches the order positions were actually built in.
    orderBy: [{ transactedAt: "asc" }, { createdAt: "asc" }],
  });

  const { quantity: transactionQuantity, avgCostBasis: transactionAvgCostBasis } = transactions.reduce(
    (pos, t) => {
      const qty = Number(t.quantity);

      if (t.type === "BUY") {
        const newQty = pos.quantity + qty;
        return {
          quantity: newQty,
          avgCostBasis:
            (pos.quantity * pos.avgCostBasis + qty * Number(t.price) + Number(t.fee)) / newQty,
        };
      }

      return { quantity: Math.max(0, pos.quantity - qty), avgCostBasis: pos.avgCostBasis };
    },
    { quantity: 0, avgCostBasis: 0 }
  );
  const existing = await tx.holding.findUnique({
    where: { portfolioId_assetId: { portfolioId, assetId } },
  });

  const holdingQuantity = Number(existing?.quantity ?? 0)
  const holdingAvgCostBasis = Number(existing?.avgCostBasis ?? 0)
  const newQuantity = holdingQuantity - transactionQuantity

  if (newQuantity <= 0) {
    if (existing) {
      await tx.holding.delete({ where: { id: existing.id } });
    }
    return;
  }

  const newAvgCostBasis = (holdingAvgCostBasis * holdingQuantity - transactionQuantity * transactionAvgCostBasis) / newQuantity

  if (existing) {
    await tx.holding.update({
      where: { id: existing.id },
      data: {
        quantity: newQuantity, avgCostBasis: newAvgCostBasis
      },
    });
  } else {
    await tx.holding.create({
      data: { portfolioId, assetId, quantity: newQuantity, avgCostBasis: newAvgCostBasis },
    });
  }
}
