import type { FastifyPluginAsync } from "fastify";
import prisma from "../prisma.js";
import { fetchQuote } from "../services/yahoo-finance.js";

const CACHE_TTL_MS = 15 * 60 * 1000;

export const pricesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { tickers?: string } }>("/prices", async (request, reply) => {
    const { tickers } = request.query;

    if (!tickers) {
      return reply.status(400).send({ error: "tickers query param is required" });
    }

    const symbols = tickers
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const settled = await Promise.allSettled(symbols.map((s) => getPriceWithCache(s)));
    const results = settled.map((result, i) =>
      result.status === "fulfilled"
        ? result.value
        : { ticker: symbols[i], error: result.reason instanceof Error ? result.reason.message : "Unknown error" }
    );
    return results;
  });
};

async function getPriceWithCache(symbol: string) {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const asset = await prisma.asset.findFirst({
    where: { ticker: symbol },
    include: {
      priceSnapshots: {
        where: { recordedAt: { gte: cutoff } },
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });

  if (asset?.priceSnapshots[0]) {
    const snapshot = asset.priceSnapshots[0];
    return {
      ticker: symbol,
      price: snapshot.price.toString(),
      currency: snapshot.currency,
      recordedAt: snapshot.recordedAt,
      cached: true,
    };
  }

  const quote = await fetchQuote(symbol);

  let assetId: string;
  if (!asset) {
    const created = await prisma.asset.create({
      data: {
        ticker: symbol,
        name: quote.name,
        assetType: quote.quoteType,
        exchange: quote.exchange,
        currency: quote.currency,
      },
    });
    assetId = created.id;
  } else {
    await prisma.asset.update({
      where: { id: asset.id },
      data: { name: quote.name },
    });
    assetId = asset.id;
  }

  const snapshot = await prisma.priceSnapshot.create({
    data: {
      assetId,
      price: quote.price,
      currency: quote.currency,
      recordedAt: new Date(),
    },
  });

  return {
    ticker: symbol,
    price: snapshot.price.toString(),
    currency: snapshot.currency,
    recordedAt: snapshot.recordedAt,
    cached: false,
  };
}
