import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema, priceQuerySchema, priceResultSchema } from "@repo/api-contract";
import { getRates } from "../services/fx-rates.js";
import { getPrice } from "../services/prices.js";

// Each cache-miss symbol fans out into a Yahoo fetch plus DB writes; cap the
// batch so one request can't amplify into an unbounded number of outbound calls.
const MAX_TICKERS = 50;

const pricesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/prices",
    {
      onRequest: app.verifyInternalSecret,
      // Expensive route (up to 50 outbound fetches per call) — tighter than the
      // global backstop.
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: { querystring: priceQuerySchema, response: { 200: z.array(priceResultSchema), 400: errorResponseSchema } },
    },
    async (request, reply) => {
      const { tickers, currency } = request.query;

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

      // One rate fetch for the whole batch. Echoed back so callers can convert
      // their own figures (cost bases) with exactly the rates used here.
      const rates = await getRates(new Date());
      const echoed = { mepRate: rates.mepRate.toString(), cclRate: rates.cclRate.toString() };

      // Settle per ticker so one bad symbol can't fail the batch. Handling the
      // failure inside the map (rather than zipping `allSettled` results back to
      // `symbols` by index) is what guarantees every item carries its ticker.
      return Promise.all(
        symbols.map(async (symbol) => {
          try {
            return { ...(await getPrice(app.prisma, symbol, currency, rates)), ...echoed };
          } catch (error) {
            return { ticker: symbol, error: error instanceof Error ? error.message : "Unknown error" };
          }
        }),
      );
    },
  );
};

export default pricesRoutes;
