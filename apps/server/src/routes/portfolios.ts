import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  createPortfolioRequestSchema,
  errorResponseSchema,
  holdingSchema,
  portfolioSchema,
  transactionListQuerySchema,
  transactionPageSchema,
  transactionSchema,
  transactionTypeSchema,
} from "@repo/api-contract";
import { resolveTransactionAsset } from "../services/assets.js";
import { requirePortfolio, requireTransaction } from "../services/authorization.js";
import { recomputeHolding } from "../services/holdings.js";

// Route-local request schemas. Response shapes and the closed value sets live in
// @repo/api-contract, so the web app's types are derived from the same source.
const portfolioParams = z.object({ id: z.uuid() });
const transactionParams = z.object({ id: z.uuid(), txId: z.uuid() });

// Exported for schema-level tests (date anchoring, type normalization).
export const createTransactionBody = z.object({
  ticker: z.string().min(1).max(20),
  // Accept any casing from the client, validate against the contract's set.
  type: z.preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), transactionTypeSchema),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  // Wider than the contract's currency enum on purpose: the server also accepts
  // whatever currency an imported/legacy row carries, and normalizes to USD.
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
  notes: z.string().max(500).optional(),
});

// Edits accept the same fields plus an optional target portfolio — supplying a
// different id moves the transaction (and its holding effect) between portfolios.
const updateTransactionBody = createTransactionBody.extend({
  portfolioId: z.uuid().optional(),
});

const portfoliosRoutes: FastifyPluginAsync = async (fastify) => {
  // Opt this plugin's routes into Zod-typed request/reply inference.
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // #2 — `app.authenticate` runs first and sets `request.userId`.
  // #3 — `app.prisma` is the decorated shared client (no direct import).
  app.get("/portfolios", { onRequest: app.authenticate, schema: { response: { 200: z.array(portfolioSchema) } } }, async (request) =>
    app.prisma.portfolio.findMany({
      where: { userId: request.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  );

  app.post(
    "/portfolios",
    {
      onRequest: app.authenticate,
      schema: { body: createPortfolioRequestSchema, response: { 201: portfolioSchema } },
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
    {
      onRequest: app.authenticate,
      schema: { params: portfolioParams, response: { 200: z.array(holdingSchema), 404: errorResponseSchema } },
    },
    async (request) => {
      await requirePortfolio(app.prisma, request.params.id, request.userId);

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
      onRequest: app.authenticate,
      schema: {
        params: portfolioParams,
        querystring: transactionListQuerySchema,
        response: {
          200: transactionPageSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      await requirePortfolio(app.prisma, request.params.id, request.userId);

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
      onRequest: app.authenticate,
      schema: { params: portfolioParams, body: createTransactionBody, response: { 201: transactionSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      await requirePortfolio(app.prisma, request.params.id, request.userId);

      const { type, quantity, transactedAt, notes } = request.body;
      const {
        asset,
        price,
        currency,
        fee: txFee,
      } = await resolveTransactionAsset(app.prisma, {
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
      onRequest: app.authenticate,
      schema: { params: transactionParams, body: updateTransactionBody, response: { 200: transactionSchema, 404: errorResponseSchema } },
    },
    async (request) => {
      await requirePortfolio(app.prisma, request.params.id, request.userId);
      const existing = await requireTransaction(app.prisma, request.params.txId, request.params.id);

      // An edit may move the transaction to another of the user's portfolios.
      const targetPortfolioId = request.body.portfolioId ?? request.params.id;
      if (targetPortfolioId !== request.params.id) {
        await requirePortfolio(app.prisma, targetPortfolioId, request.userId, "Target portfolio not found");
      }

      const { type, quantity, transactedAt, notes } = request.body;
      const { asset, price, currency, fee } = await resolveTransactionAsset(app.prisma, {
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
    { onRequest: app.authenticate, schema: { params: transactionParams, response: { 204: z.null(), 404: errorResponseSchema } } },
    async (request, reply) => {
      await requirePortfolio(app.prisma, request.params.id, request.userId);
      const transaction = await requireTransaction(app.prisma, request.params.txId, request.params.id);

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
