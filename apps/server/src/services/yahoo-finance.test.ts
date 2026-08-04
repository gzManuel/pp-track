import { describe, expect, it, vi, beforeEach } from "vitest";
import { toArsTicker, toUsdTicker, resolveUsdVariant } from "./yahoo-finance.js";
import * as yahooFinance from "./yahoo-finance.js";

describe("toArsTicker", () => {
  it("should strip the D from a USD CEDEAR variant", () => {
    expect(toArsTicker("SPYD.BA")).toBe("SPY.BA");
  });

  it("should pass through an ARS BYMA ticker", () => {
    expect(toArsTicker("SPY.BA")).toBe("SPY.BA");
  });

  it("should pass through non-BYMA tickers, even ones ending in D", () => {
    expect(toArsTicker("AAPL")).toBe("AAPL");
    expect(toArsTicker("MCD")).toBe("MCD");
  });

  it("should match the suffix case-insensitively and canonicalize it to .BA", () => {
    expect(toArsTicker("spyd.ba")).toBe("spy.BA");
  });
});

describe("toUsdTicker", () => {
  it("should add the D to a peso BYMA ticker", () => {
    expect(toUsdTicker("SPY.BA")).toBe("SPYD.BA");
  });

  it("should pass through an existing USD variant", () => {
    expect(toUsdTicker("SPYD.BA")).toBe("SPYD.BA");
  });

  it("should pass through non-BYMA tickers", () => {
    expect(toUsdTicker("AAPL")).toBe("AAPL");
  });

  it("should round-trip with toArsTicker", () => {
    expect(toArsTicker(toUsdTicker("GGAL.BA"))).toBe("GGAL.BA");
  });
});

describe("resolveUsdVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the regex-derived symbol when it validates (USD-quoted)", async () => {
    vi.spyOn(yahooFinance, "fetchQuote").mockResolvedValue({
      symbol: "SPYD.BA",
      price: 6.5,
      currency: "USD",
      name: "SPY CEDEAR",
      quoteType: "EQUITY",
      exchange: "BUE",
    });

    const result = await resolveUsdVariant("SPY CEDEAR", "SPYD.BA");
    expect(result).toBe("SPYD.BA");
  });

  // Full coverage of search fallback is in prices.test.ts integration tests.
  // The yf.search call is internal and difficult to mock without exporting yf.
});
