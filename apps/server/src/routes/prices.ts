import type { FastifyPluginAsync } from "fastify";
import prisma from "../prisma.js";
import { fetchQuote, toArsTicker } from "../services/yahoo-finance.js";
import getMepRate from "../services/mep.js";

const CACHE_TTL_MS = 15 * 60 * 1000;

const pricesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { tickers?: string; currency?: string } }>("/prices", async (request, reply) => {
    const { tickers, currency } = request.query;

    if (!tickers) {
      return reply.status(400).send({ error: "tickers query param is required" });
    }

    // CEDEARs are tracked in USD; request `?currency=ARS` to fetch the D-stripped ticker.
    const ars = currency?.toUpperCase() === "ARS";

    const symbols = tickers
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const settled = await Promise.allSettled(symbols.map((s) => getPriceWithCache(s, ars)));
    const results = settled.map((result, i) =>
      result.status === "fulfilled"
        ? result.value
        : { ticker: symbols[i], error: result.reason instanceof Error ? result.reason.message : "Unknown error" },
    );
    return results;
  });
};

export default pricesRoutes;

async function getPriceWithCache(symbol: string, ars: boolean) {
  // Fetch/cache under the actually-quoted ticker (e.g. SPY.BA for ARS), but
  // always respond keyed by the requested ticker so callers can match results.
  // CEDEARs encode ARS as a distinct .BA ticker; crypto keeps its single USD
  // ticker and is converted to ARS via the MEP rate below.
  const fetchSymbol = ars ? toArsTicker(symbol) : symbol;
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const asset = await prisma.asset.findFirst({
    where: { ticker: fetchSymbol },
    include: {
      priceSnapshots: {
        where: { recordedAt: { gte: cutoff } },
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });

  let result: {
    ticker: string;
    price: string;
    currency: string;
    recordedAt: Date;
    cached: boolean;
  };
  let assetType: string;

  if (asset?.priceSnapshots[0]) {
    const snapshot = asset.priceSnapshots[0];
    assetType = asset.assetType;
    result = {
      ticker: symbol,
      price: snapshot.price.toString(),
      currency: snapshot.currency,
      recordedAt: snapshot.recordedAt,
      cached: true,
    };
  } else {
    const quote = await fetchQuote(fetchSymbol);
    assetType = quote.quoteType;

    let assetId: string;
    if (!asset) {
      const created = await prisma.asset.create({
        data: {
          ticker: fetchSymbol,
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

    result = {
      ticker: symbol,
      price: snapshot.price.toString(),
      currency: snapshot.currency,
      recordedAt: snapshot.recordedAt,
      cached: false,
    };
  }

  // Crypto is stored once in USD; convert to ARS on the fly with the MEP rate
  // when requested. (CEDEARs already came back in ARS via their .BA ticker.)
  if (ars && assetType === "CRYPTOCURRENCY" && result.currency === "USD") {
    const rate = await getMepRate(new Date());
    return {
      ...result,
      price: (Number(result.price) * rate).toString(),
      currency: "ARS",
    };
  }

  return result;
}
