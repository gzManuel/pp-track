import type { FastifyPluginAsync } from "fastify";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { fetchQuote, toArsTicker } from "../services/yahoo-finance.js";
import getMepRate from "../services/mep.js";

const CACHE_TTL_MS = 15 * 60 * 1000;

// How long stale snapshots are kept before being pruned on the next write.
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Each cache-miss symbol fans out into a Yahoo fetch plus DB writes; cap the
// batch so one request can't amplify into an unbounded number of outbound calls.
const MAX_TICKERS = 50;

const pricesQuery = z.object({
  tickers: z.string().min(1, "tickers query param is required"),
  currency: z.string().optional(),
});

// Batch items are a success/error union; the schema whitelists exactly the
// fields either shape may carry.
const priceItem = z.object({
  ticker: z.string().optional(),
  price: z.string().optional(),
  currency: z.string().optional(),
  recordedAt: z.date().optional(),
  cached: z.boolean().optional(),
  mepRate: z.string().optional(),
  error: z.string().optional(),
});

const errorResponse = z.object({ error: z.string() });

const pricesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/prices",
    {
      preHandler: app.verifyInternalSecret,
      // Expensive route (up to 50 outbound fetches per call) — tighter than the
      // global backstop.
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: { querystring: pricesQuery, response: { 200: z.array(priceItem), 400: errorResponse } },
    },
    async (request, reply) => {
      const { tickers, currency } = request.query;

      // CEDEARs are tracked in USD; request `?currency=ARS` to fetch the D-stripped ticker.
      const ars = currency?.toUpperCase() === "ARS";

      const symbols = tickers
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (symbols.length === 0) {
        return reply.status(400).send({ error: "tickers query param is required" });
      }
      if (symbols.length > MAX_TICKERS) {
        return reply.status(400).send({ error: `Too many tickers (max ${String(MAX_TICKERS)})` });
      }

      // One MEP fetch per request: used to convert crypto USD prices, and echoed
      // back so callers can convert USD-denominated cost bases to ARS themselves.
      const mepRate = ars ? await getMepRate(new Date()) : null;

      const settled = await Promise.allSettled(symbols.map((s) => getPriceWithCache(app.prisma, s, ars, mepRate)));
      const results = settled.map((result, i) =>
        result.status === "fulfilled"
          ? { ...result.value, ...(mepRate != null && { mepRate: mepRate.toString() }) }
          : { ticker: symbols[i], error: result.reason instanceof Error ? result.reason.message : "Unknown error" },
      );
      return results;
    },
  );
};

export default pricesRoutes;

async function getPriceWithCache(prisma: PrismaClient, symbol: string, ars: boolean, mepRate: number | null) {
  // Fetch/cache under the actually-quoted ticker (e.g. SPY.BA for ARS), but
  // always respond keyed by the requested ticker so callers can match results.
  // CEDEARs encode ARS as a distinct .BA ticker; crypto keeps its single USD
  // ticker and is converted to ARS via the MEP rate below.
  const fetchSymbol = ars ? toArsTicker(symbol) : symbol;
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const asset = await prisma.asset.findFirst({
    where: { ticker: fetchSymbol },
    // Uniqueness is (ticker, exchange) — order deterministically in case the
    // same ticker exists on several exchanges.
    orderBy: { updatedAt: "desc" },
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
      let created;
      try {
        created = await prisma.asset.create({
          data: {
            ticker: fetchSymbol,
            name: quote.name,
            assetType: quote.quoteType,
            exchange: quote.exchange ?? "",
            currency: quote.currency,
          },
        });
      } catch (error) {
        // Lost a create race with a concurrent request — reuse exactly the
        // colliding (ticker, exchange) row.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          created = await prisma.asset.findUnique({
            where: { ticker_exchange: { ticker: fetchSymbol, exchange: quote.exchange ?? "" } },
          });
        }
        if (!created) throw error;
      }
      assetId = created.id;
    } else {
      if (asset.name !== quote.name) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { name: quote.name },
        });
      }
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

    // Snapshots are a price cache, not history — prune this asset's stale rows
    // in the same write path so the table can't grow without bound.
    await prisma.priceSnapshot.deleteMany({
      where: { assetId, recordedAt: { lt: new Date(Date.now() - SNAPSHOT_RETENTION_MS) } },
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
  if (ars && mepRate != null && assetType === "CRYPTOCURRENCY" && result.currency === "USD") {
    return {
      ...result,
      // Decimal, not float math — consistent with every other money path.
      price: new Prisma.Decimal(result.price).times(mepRate).toString(),
      currency: "ARS",
    };
  }

  return result;
}
