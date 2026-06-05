import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { fetchQuote } from "../services/yahoo-finance.js";

// #1 — Schemas drive both runtime validation and the inferred TS types.
const portfolioParams = z.object({ id: z.uuid() });

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
  transactedAt: z.coerce.date(),
  fee: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const portfoliosRoutes: FastifyPluginAsync = async (fastify) => {
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
        orderBy: { transactedAt: "desc" },
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

      const { ticker, type, quantity, price, currency, transactedAt, fee, notes } =
        request.body;

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

      return app.prisma.transaction.create({
        data: {
          portfolioId: request.params.id,
          assetId: asset.id,
          type, // already normalized to uppercase by the schema
          quantity,
          price,
          currency,
          fee: fee ?? 0,
          notes,
          transactedAt, // already a Date via z.coerce.date()
        },
        include: { asset: { select: { ticker: true, name: true } } },
      });
    }
  );
};
