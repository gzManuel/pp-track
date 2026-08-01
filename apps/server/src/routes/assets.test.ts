import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { asPrismaClient, createStubPrisma, type StubPrisma } from "../test-support/stub-prisma.js";
import { auth } from "../test-support/fixtures.js";
import * as yahooFinance from "../services/yahoo-finance.js";

interface AssetSearchResult {
  symbol: string;
  name: string;
  source: "portfolio" | "yahoo";
}

describe("assets routes", () => {
  let app: FastifyInstance;
  let prisma: StubPrisma;

  beforeEach(async () => {
    prisma = createStubPrisma();
    app = await buildApp({ prisma: asPrismaClient(prisma), logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("GET /assets/search", () => {
    it("should return 401 without credentials", async () => {
      const res = await app.inject({ method: "GET", url: "/api/assets/search?q=AAPL" });
      expect(res.statusCode).toBe(401);
    });

    it("should return portfolio assets matching query", async () => {
      const ownedAsset = { ticker: "AAPL", name: "Apple Inc.", exchange: "NMS", assetType: "EQUITY" };
      prisma.asset.findMany.mockResolvedValue([ownedAsset]);

      const res = await app.inject({ method: "GET", url: "/api/assets/search?q=AAP", headers: auth });

      expect(res.statusCode).toBe(200);
      const json = res.json<AssetSearchResult[]>();
      expect(json).toContainEqual(expect.objectContaining({ symbol: "AAPL", source: "portfolio" }));
    });

    it("should merge portfolio assets with Yahoo results", async () => {
      prisma.asset.findMany.mockResolvedValue([{ ticker: "AAPL", name: "Apple Inc.", exchange: "NMS", assetType: "EQUITY" }]);

      vi.spyOn(yahooFinance, "searchSymbols").mockResolvedValue([
        { symbol: "APPL", name: "Some Other", exchange: null, type: "EQUITY" },
        { symbol: "AAPL", name: "Apple", exchange: "NMS", type: "EQUITY" },
      ]);

      const res = await app.inject({ method: "GET", url: "/api/assets/search?q=AAP", headers: auth });

      expect(res.statusCode).toBe(200);
      const json = res.json<AssetSearchResult[]>();
      const symbols = json.map((r) => r.symbol);
      expect(symbols).toContain("AAPL");
      expect(symbols).toHaveLength(2);
    });

    it("should dedupe results by symbol (case-insensitive)", async () => {
      prisma.asset.findMany.mockResolvedValue([{ ticker: "AAPL", name: "Apple Inc.", exchange: "NMS", assetType: "EQUITY" }]);

      vi.spyOn(yahooFinance, "searchSymbols").mockResolvedValue([{ symbol: "AAPL", name: "Apple", exchange: "NMS", type: "EQUITY" }]);

      const res = await app.inject({ method: "GET", url: "/api/assets/search?q=AAP", headers: auth });

      expect(res.statusCode).toBe(200);
      const json = res.json<AssetSearchResult[]>();
      const symbols = json.map((r) => r.symbol);
      expect(symbols.filter((s) => s === "AAPL")).toHaveLength(1);
    });

    it("should cap Yahoo results at MAX_YAHOO_RESULTS", async () => {
      prisma.asset.findMany.mockResolvedValue([]);

      const yahooResults = Array.from({ length: 20 }, (_, i) => ({
        symbol: `SYM${i.toString()}`,
        name: `Symbol ${i.toString()}`,
        exchange: null,
        type: "EQUITY",
      }));

      vi.spyOn(yahooFinance, "searchSymbols").mockResolvedValue(yahooResults);

      const res = await app.inject({ method: "GET", url: "/api/assets/search?q=SYM", headers: auth });

      expect(res.statusCode).toBe(200);
      const json = res.json<AssetSearchResult[]>();
      expect(json).toHaveLength(10);
    });

    it("should not blank portfolio matches if Yahoo search fails", async () => {
      prisma.asset.findMany.mockResolvedValue([{ ticker: "AAPL", name: "Apple Inc.", exchange: "NMS", assetType: "EQUITY" }]);

      vi.spyOn(yahooFinance, "searchSymbols").mockRejectedValue(new Error("Network error"));

      const res = await app.inject({ method: "GET", url: "/api/assets/search?q=AAP", headers: auth });

      expect(res.statusCode).toBe(200);
      const json = res.json<AssetSearchResult[]>();
      expect(json).toContainEqual(expect.objectContaining({ symbol: "AAPL", source: "portfolio" }));
    });

    it("should return empty array when no results match", async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      vi.spyOn(yahooFinance, "searchSymbols").mockResolvedValue([]);

      const res = await app.inject({ method: "GET", url: "/api/assets/search?q=NOTHINGHERE", headers: auth });

      expect(res.statusCode).toBe(200);
      expect(res.json<AssetSearchResult[]>()).toEqual([]);
    });
  });
});
