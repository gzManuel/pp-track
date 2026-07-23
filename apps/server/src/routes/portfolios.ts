import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fetchQuote, toUsdTicker } from "../services/yahoo-finance.js";
import getMepRate from "../services/mep.js";
import { recomputeHolding } from "../services/holdings.js";

// #1 — Schemas drive both runtime validation and the inferred TS types.
const portfolioParams = z.object({ id: z.uuid() });
const transactionParams = z.object({ id: z.uuid(), txId: z.uuid() });

const createPortfolioBody = z.object({
  name: z.string().min(1),
});

// Cursor pagination for the transactions list — the only unbounded-cardinality
// collection in the API.
const transactionsListQuery = z.object({
  take: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});

// Exported for schema-level tests (date anchoring, type normalization).
export const createTransactionBody = z.object({
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

    // Uniqueness is (ticker, exchange); a ticker alone can match several rows,
    // so order deterministically instead of taking an arbitrary one.
    let asset = await app.prisma.asset.findFirst({ where: { ticker }, orderBy: { updatedAt: "desc" } });
    if (!asset) {
      let data: { ticker: string; name: string; assetType: string; exchange: string; currency: string };
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
        data = { ticker, name: ticker, assetType: "EQUITY", exchange: "", currency };
      }

      try {
        asset = await app.prisma.asset.create({ data });
      } catch (error) {
        // Lost a create race: another request inserted the same (ticker, exchange)
        // first — use exactly that row instead of failing.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          asset = await app.prisma.asset.findUnique({
            where: { ticker_exchange: { ticker: data.ticker, exchange: data.exchange } },
          });
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
      schema: {
        params: portfolioParams,
        querystring: transactionsListQuery,
        response: {
          200: z.object({ items: z.array(transactionResponse), nextCursor: z.uuid().nullable() }),
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const portfolio = await app.prisma.portfolio.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!portfolio) {
        return reply.status(404).send({ error: "Portfolio not found" });
      }

      const { take, cursor } = request.query;
      // Fetch one extra row to know whether another page exists. `id` breaks
      // ordering ties so the cursor is stable.
      const rows = await app.prisma.transaction.findMany({
        where: { portfolioId: request.params.id },
        include: { asset: { select: { ticker: true, name: true } } },
        orderBy: [{ transactedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursor !== undefined && { cursor: { id: cursor }, skip: 1 }),
      });

      const items = rows.slice(0, take);
      const nextCursor = rows.length > take ? (items.at(-1)?.id ?? null) : null;
      return { items, nextCursor };
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
        // Rebuild via chronological replay (not append) so a backdated BUY
        // interleaves correctly with existing sells; a SELL exceeding the
        // position held at its date rejects the whole transaction with 422.
        if (type === "BUY" || type === "SELL") {
          await recomputeHolding(tx, request.params.id, assetId, {
            excludeFromBase: transaction.id,
            rejectOversellFor: type === "SELL" ? transaction.id : undefined,
          });
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
          await recomputeHolding(tx, targetPortfolioId, asset.id, {
            excludeFromBase: existing.id,
            rejectOversellFor: type === "SELL" ? existing.id : undefined,
          });
        }

        return updated;
      });
    },
  );

  app.delete(
    "/portfolios/:id/transactions/:txId",
    { preHandler: app.authenticate, schema: { params: transactionParams, response: { 204: z.null(), 404: errorResponse } } },
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

      return reply.status(204).send(null);
    },
  );
};

export default portfoliosRoutes;
