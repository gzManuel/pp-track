import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { convertQuote, getPrice, quoteSymbolFor } from "./prices.js";
import { dec } from "../test-support/stub-prisma.js";
import * as yahooFinance from "./yahoo-finance.js";
import * as assets from "./assets.js";

const rates = { mepRate: 900, cclRate: 950 };

describe("prices", () => {
  describe("quoteSymbolFor", () => {
    it("should use USD ticker (D suffix) for MEP currency", () => {
      expect(quoteSymbolFor("SPY.BA", "MEP")).toBe("SPYD.BA");
      expect(quoteSymbolFor("AAPL", "MEP")).toBe("AAPL");
    });

    it("should use ARS ticker (base, no suffix) for ARS/CCL currencies", () => {
      expect(quoteSymbolFor("SPYD.BA", "ARS")).toBe("SPY.BA");
      expect(quoteSymbolFor("SPYC.BA", "ARS")).toBe("SPY.BA");
      expect(quoteSymbolFor("SPYD.BA", "CCL")).toBe("SPY.BA");
      expect(quoteSymbolFor("AAPL", "ARS")).toBe("AAPL");
    });
  });

  describe("convertQuote", () => {
    it("should passthrough ARS target, ARS-quoted", () => {
      const result = convertQuote(dec("1000"), "ARS", "ARS", rates);
      expect(result.price.toString()).toBe("1000");
      expect(result.currency).toBe("ARS");
    });

    it("should multiply by MEP rate for ARS target, USD-quoted", () => {
      const result = convertQuote(dec("100"), "USD", "ARS", rates);
      expect(result.price.toString()).toBe("90000");
      expect(result.currency).toBe("ARS");
    });

    it("should passthrough MEP target, USD-quoted", () => {
      const result = convertQuote(dec("100"), "USD", "MEP", rates);
      expect(result.price.toString()).toBe("100");
      expect(result.currency).toBe("USD");
    });

    it("should divide by MEP rate for MEP target, ARS-quoted", () => {
      const result = convertQuote(dec("90000"), "ARS", "MEP", rates);
      expect(result.price.toString()).toBe("100");
      expect(result.currency).toBe("USD");
    });

    it("should divide by CCL rate for CCL target, ARS-quoted", () => {
      const result = convertQuote(dec("95000"), "ARS", "CCL", rates);
      expect(result.price.toString()).toBe("100");
      expect(result.currency).toBe("USD");
    });

    it("should passthrough CCL target, USD-quoted (USD is same number for MEP and CCL)", () => {
      const result = convertQuote(dec("100"), "USD", "CCL", rates);
      expect(result.price.toString()).toBe("100");
      expect(result.currency).toBe("USD");
    });

    it("should handle case-insensitive quoted currency", () => {
      const lower = convertQuote(dec("1000"), "ars", "MEP", rates);
      const upper = convertQuote(dec("1000"), "ARS", "MEP", rates);
      const mixed = convertQuote(dec("1000"), "ArS", "MEP", rates);
      expect(lower.price.toString()).toBe(upper.price.toString());
      expect(upper.price.toString()).toBe(mixed.price.toString());
    });
  });

  describe("getPrice", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return cached price when snapshot is fresh", async () => {
      const fresh = new Date(Date.now() - 5 * 60 * 1000);
      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "Apple Inc.",
            ticker: "AAPL",
            priceSnapshots: [
              {
                id: "snap-1",
                price: dec("150"),
                currency: "USD",
                recordedAt: fresh,
              },
            ],
          }),
        },
      };

      const result = await getPrice(mockPrisma as unknown as PrismaClient, "AAPL", "ARS", rates);

      expect(result.cached).toBe(true);
      expect(result.ticker).toBe("AAPL");
      expect(result.currency).toBe("ARS");
      expect(result.recordedAt).toBe(fresh);
      // 150 USD * 900 mepRate = 135000 ARS
      expect(result.price).toBe("135000");
    });

    it("should fetch and cache price when no fresh snapshot exists", async () => {
      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "Apple Inc.",
            ticker: "AAPL",
            priceSnapshots: [],
          }),
        },
        priceSnapshot: {
          create: vi.fn().mockResolvedValue({
            price: dec("150"),
            currency: "USD",
            recordedAt: new Date("2024-01-01T12:00:00Z"),
          }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      vi.spyOn(yahooFinance, "fetchQuote").mockResolvedValue({
        symbol: "AAPL",
        price: 150,
        currency: "USD",
        name: "Apple Inc.",
        quoteType: "EQUITY",
        exchange: "NASDAQ",
      });

      const result = await getPrice(mockPrisma as unknown as PrismaClient, "AAPL", "ARS", rates);

      expect(result.cached).toBe(false);
      expect(result.ticker).toBe("AAPL");
      expect(mockPrisma.priceSnapshot.create).toHaveBeenCalled();
      expect(mockPrisma.priceSnapshot.deleteMany).toHaveBeenCalled();
    });

    it("should create asset if it does not exist", async () => {
      const mockCreateAssetOrRecover = vi.spyOn(assets, "createAssetOrRecover").mockResolvedValue({
        id: "new-asset",
        name: "New Coin",
        ticker: "NEWCOIN",
        assetType: "CRYPTOCURRENCY",
        exchange: "",
        currency: "USD",
        metadata: null,
        updatedAt: new Date(),
      });

      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        priceSnapshot: {
          create: vi.fn().mockResolvedValue({
            price: dec("50000"),
            currency: "USD",
            recordedAt: new Date(),
          }),
          deleteMany: vi.fn(),
        },
      };

      vi.spyOn(yahooFinance, "fetchQuote").mockResolvedValue({
        symbol: "NEWCOIN",
        price: 50000,
        currency: "USD",
        name: "New Coin",
        quoteType: "CRYPTOCURRENCY",
        exchange: null,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- partial mock requires any cast
      await getPrice(mockPrisma as any, "NEWCOIN", "ARS", rates);

      expect(mockCreateAssetOrRecover).toHaveBeenCalled();
      expect(mockPrisma.priceSnapshot.create).toHaveBeenCalled();
      expect(mockPrisma.priceSnapshot.deleteMany).toHaveBeenCalled();
    });

    it("should update asset name if quote name differs", async () => {
      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "Old Name",
            ticker: "AAPL",
            priceSnapshots: [],
          }),
          update: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "New Name",
          }),
        },
        priceSnapshot: {
          create: vi.fn().mockResolvedValue({
            price: dec("150"),
            currency: "USD",
            recordedAt: new Date(),
          }),
          deleteMany: vi.fn(),
        },
      };

      vi.spyOn(yahooFinance, "fetchQuote").mockResolvedValue({
        symbol: "AAPL",
        price: 150,
        currency: "USD",
        name: "New Name",
        quoteType: "EQUITY",
        exchange: "NASDAQ",
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- partial mock requires any cast
      await getPrice(mockPrisma as any, "AAPL", "ARS", rates);

      expect(mockPrisma.asset.update).toHaveBeenCalledWith({
        where: { id: "asset-1" },
        data: { name: "New Name" },
      });
    });

    it("should not update asset if name has not changed", async () => {
      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "Apple Inc.",
            ticker: "AAPL",
            priceSnapshots: [],
          }),
          update: vi.fn(),
        },
        priceSnapshot: {
          create: vi.fn().mockResolvedValue({
            price: dec("150"),
            currency: "USD",
            recordedAt: new Date(),
          }),
          deleteMany: vi.fn(),
        },
      };

      vi.spyOn(yahooFinance, "fetchQuote").mockResolvedValue({
        symbol: "AAPL",
        price: 150,
        currency: "USD",
        name: "Apple Inc.",
        quoteType: "EQUITY",
        exchange: "NASDAQ",
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- partial mock requires any cast
      await getPrice(mockPrisma as any, "AAPL", "ARS", rates);

      expect(mockPrisma.asset.update).not.toHaveBeenCalled();
    });

    it("should prune stale snapshots after caching", async () => {
      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "Apple Inc.",
            ticker: "AAPL",
            priceSnapshots: [],
          }),
        },
        priceSnapshot: {
          create: vi.fn().mockResolvedValue({
            price: dec("150"),
            currency: "USD",
            recordedAt: new Date(),
          }),
          deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
        },
      };

      vi.spyOn(yahooFinance, "fetchQuote").mockResolvedValue({
        symbol: "AAPL",
        price: 150,
        currency: "USD",
        name: "Apple Inc.",
        quoteType: "EQUITY",
        exchange: "NASDAQ",
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- partial mock requires any cast
      await getPrice(mockPrisma as any, "AAPL", "ARS", rates);

      expect(mockPrisma.priceSnapshot.deleteMany).toHaveBeenCalledWith({
        where: {
          assetId: "asset-1",
          recordedAt: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns any type
            lt: expect.any(Date),
          },
        },
      });
    });

    it("should return result keyed by requested ticker, not fetch symbol", async () => {
      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "SPY CEDEAR",
            ticker: "SPYD.BA",
            priceSnapshots: [
              {
                price: dec("100"),
                currency: "USD",
                recordedAt: new Date(),
              },
            ],
          }),
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- partial mock requires any cast
      const result = await getPrice(mockPrisma as any, "SPY.BA", "MEP", rates);

      expect(result.ticker).toBe("SPY.BA");
    });

    it("should convert currency in result", async () => {
      const mockPrisma = {
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-1",
            name: "SPY",
            ticker: "SPY.BA",
            priceSnapshots: [
              {
                price: dec("1000"),
                currency: "ARS",
                recordedAt: new Date(),
              },
            ],
          }),
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- partial mock requires any cast
      const result = await getPrice(mockPrisma as any, "SPY.BA", "CCL", rates);

      expect(result.currency).toBe("USD");
      // 1000 ARS / 950 cclRate = ~1.05 USD
      expect(parseFloat(result.price)).toBeCloseTo(1.052631578947, 5);
    });
  });
});
