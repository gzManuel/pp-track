import type { FastifyPluginAsync } from "fastify";
import prisma from "../prisma.js";
import { fetchQuote } from "../services/yahoo-finance.js";

function authorize(request: { headers: Record<string, string | string[] | undefined> }) {
  const secret = request.headers["x-internal-secret"];
  const userId = request.headers["x-user-id"];
  if (secret !== process.env.INTERNAL_API_SECRET || !userId) return null;
  return Array.isArray(userId) ? userId[0] : userId;
}

export const portfoliosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/portfolios", async (request, reply) => {
    const userId = authorize(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    return prisma.portfolio.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  });

  app.post<{ Body: { name: string } }>("/portfolios", async (request, reply) => {
    const userId = authorize(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { name } = request.body;

    const existingCount = await prisma.portfolio.count({ where: { userId } });

    return prisma.portfolio.create({
      data: { userId, name, isDefault: existingCount === 0 },
    });
  });

  app.get<{ Params: { id: string } }>("/portfolios/:id/holdings", async (request, reply) => {
    const userId = authorize(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: request.params.id, userId },
    });
    if (!portfolio) return reply.status(404).send({ error: "Portfolio not found" });

    return prisma.holding.findMany({
      where: { portfolioId: request.params.id },
      include: { asset: { select: { ticker: true, name: true, currency: true } } },
      orderBy: { createdAt: "asc" },
    });
  });

  app.get<{ Params: { id: string } }>("/portfolios/:id/transactions", async (request, reply) => {
    const userId = authorize(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: request.params.id, userId },
    });
    if (!portfolio) return reply.status(404).send({ error: "Portfolio not found" });

    return prisma.transaction.findMany({
      where: { portfolioId: request.params.id },
      include: { asset: { select: { ticker: true, name: true } } },
      orderBy: { transactedAt: "desc" },
    });
  });

  app.post<{
    Params: { id: string };
    Body: {
      ticker: string;
      type: string;
      quantity: number;
      price: number;
      currency: string;
      transactedAt: string;
      fee?: number;
      notes?: string;
    };
  }>("/portfolios/:id/transactions", async (request, reply) => {
    const userId = authorize(request);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: request.params.id, userId },
    });
    if (!portfolio) return reply.status(404).send({ error: "Portfolio not found" });

    const { ticker, type, quantity, price, currency, transactedAt, fee, notes } = request.body;

    let asset = await prisma.asset.findFirst({ where: { ticker } });
    if (!asset) {
      try {
        const quote = await fetchQuote(ticker);
        asset = await prisma.asset.create({
          data: { ticker, name: quote.name, assetType: quote.quoteType, exchange: quote.exchange, currency: quote.currency },
        });
      } catch {
        asset = await prisma.asset.create({
          data: { ticker, name: ticker, assetType: "EQUITY", currency },
        });
      }
    }

    return prisma.transaction.create({
      data: {
        portfolioId: request.params.id,
        assetId: asset.id,
        type: type.toUpperCase(),
        quantity,
        price,
        currency,
        fee: fee ?? 0,
        notes,
        transactedAt: new Date(transactedAt),
      },
      include: { asset: { select: { ticker: true, name: true } } },
    });
  });
};
