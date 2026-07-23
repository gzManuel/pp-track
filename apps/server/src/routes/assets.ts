import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { searchSymbols } from "../services/yahoo-finance.js";

// Cap the free-text query — it is forwarded verbatim to Yahoo's search API.
const searchQuery = z.object({ q: z.string().min(1).max(100) });

// Cap merged Yahoo results so the autocomplete payload stays small.
const MAX_YAHOO_RESULTS = 10;

const searchResult = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string().nullable(),
  type: z.string(),
  source: z.enum(["portfolio", "yahoo"]),
});

interface AssetSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string;
  source: "portfolio" | "yahoo";
}

const assetsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Ticker autocomplete: the user's own assets first, then Yahoo search results.
  app.get(
    "/assets/search",
    { preHandler: app.authenticate, schema: { querystring: searchQuery, response: { 200: z.array(searchResult) } } },
    async (request) => {
      const { q } = request.query;

      // Assets the user owns (held now or previously transacted), matched on
      // ticker or name. Holdings cover current positions; transactions catch
      // assets that have since been fully sold.
      const owned = await app.prisma.asset.findMany({
        where: {
          AND: [
            {
              OR: [
                { holdings: { some: { portfolio: { userId: request.userId } } } },
                { transactions: { some: { portfolio: { userId: request.userId } } } },
              ],
            },
            {
              OR: [{ ticker: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
            },
          ],
        },
        select: { ticker: true, name: true, exchange: true, assetType: true },
        take: 5,
      });

      const results: AssetSearchResult[] = owned.map((a) => ({
        symbol: a.ticker,
        name: a.name,
        exchange: a.exchange,
        type: a.assetType,
        source: "portfolio",
      }));

      const ownedSymbols = new Set(results.map((r) => r.symbol.toUpperCase()));

      // Yahoo failures shouldn't blank out the portfolio matches we already have.
      let yahoo: Awaited<ReturnType<typeof searchSymbols>> = [];
      try {
        yahoo = await searchSymbols(q);
      } catch (err) {
        request.log.warn({ err }, "yahoo symbol search failed");
      }

      const yahooResults: AssetSearchResult[] = yahoo
        .filter((r) => !ownedSymbols.has(r.symbol.toUpperCase()))
        .slice(0, MAX_YAHOO_RESULTS)
        .map((r) => ({ ...r, source: "yahoo" }));

      return [...results, ...yahooResults];
    },
  );
};

export default assetsRoutes;
