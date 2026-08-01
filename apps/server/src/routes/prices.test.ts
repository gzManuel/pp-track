import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PriceResult } from "@repo/api-contract";
import { buildApp } from "../app.js";
import { asPrismaClient, createStubPrisma, type StubPrisma } from "../test-support/stub-prisma.js";
import { SECRET } from "../test-support/fixtures.js";
import * as prices from "../services/prices.js";
import * as fxRates from "../services/fx-rates.js";

describe("prices routes", () => {
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

  describe("authentication", () => {
    it("should return 401 without internal secret", async () => {
      const res = await app.inject({ method: "GET", url: "/api/prices?tickers=AAPL&currency=MEP" });
      expect(res.statusCode).toBe(401);
    });

    it("should return 401 with wrong internal secret", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/prices?tickers=AAPL&currency=MEP",
        headers: { "x-internal-secret": "wrong-secret" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /prices", () => {
    beforeEach(() => {
      vi.spyOn(fxRates, "getRates").mockResolvedValue({ mepRate: 900, cclRate: 950 });
    });

    it("should require tickers query param", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/prices?currency=MEP",
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
    });

    it("should reject empty/whitespace-only tickers after filtering", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/prices?tickers=%20%20&currency=MEP",
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "tickers query param is required" });
    });

    it("should reject too many tickers (> 50)", async () => {
      const tickers = Array.from({ length: 51 }, (_, i) => `SYM${i.toString()}`).join(",");

      const res = await app.inject({
        method: "GET",
        url: `/api/prices?tickers=${encodeURIComponent(tickers)}&currency=MEP`,
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(400);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.stringContaining() returns any type
      expect(res.json<PriceResult[]>()).toMatchObject({ error: expect.stringContaining("Too many tickers") });
    });

    it("should return prices for valid symbols", async () => {
      vi.spyOn(prices, "getPrice").mockResolvedValue({
        ticker: "AAPL",
        price: "150",
        currency: "MEP",
        recordedAt: new Date(),
        cached: true,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/prices?tickers=AAPL&currency=MEP",
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<PriceResult[]>();
      expect(json).toHaveLength(1);
      expect(json[0]).toMatchObject({
        ticker: "AAPL",
        price: "150",
        currency: "MEP",
        cached: true,
      });
    });

    it("should include echoed rates in each result", async () => {
      vi.spyOn(prices, "getPrice").mockResolvedValue({
        ticker: "AAPL",
        price: "150",
        currency: "MEP",
        recordedAt: new Date(),
        cached: true,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/prices?tickers=AAPL&currency=MEP",
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<PriceResult[]>();
      expect(json[0]).toHaveProperty("mepRate", "900");
      expect(json[0]).toHaveProperty("cclRate", "950");
    });

    it("should isolate per-ticker errors without failing batch", async () => {
      vi.spyOn(prices, "getPrice").mockImplementation(async (_, ticker) => {
        if (ticker === "BAD") throw new Error("Symbol not found");
        return {
          ticker,
          price: "100",
          currency: "MEP",
          recordedAt: new Date(),
          cached: false,
        };
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/prices?tickers=AAPL,BAD,GOOGL&currency=MEP",
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<PriceResult[]>();
      expect(json).toHaveLength(3);

      const bad = json.find((r) => r.ticker === "BAD");
      expect(bad).toHaveProperty("error");

      const good = json.filter((r) => !("error" in r) || r.error === undefined);
      expect(good).toHaveLength(2);
    });

    it("should trim whitespace from ticker symbols", async () => {
      vi.spyOn(prices, "getPrice").mockImplementation(async (_, ticker) => ({
        ticker,
        price: "150",
        currency: "MEP",
        recordedAt: new Date(),
        cached: true,
      }));

      const res = await app.inject({
        method: "GET",
        url: "/api/prices?tickers=AAPL,%20GOOGL%20,MSFT&currency=MEP",
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<PriceResult[]>();
      expect(json.map((r) => r.ticker)).toEqual(["AAPL", "GOOGL", "MSFT"]);
    });

    it("should convert unknown errors to string message", async () => {
      vi.spyOn(prices, "getPrice").mockImplementation(async (_, ticker) => {
        if (ticker === "ERROR") {
          throw Object.create(null);
        }
        return { ticker, price: "100", currency: "MEP", recordedAt: new Date(), cached: false };
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/prices?tickers=ERROR&currency=MEP",
        headers: { "x-internal-secret": SECRET },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<PriceResult[]>();
      expect(json[0]).toHaveProperty("error", "Unknown error");
    });
  });
});
