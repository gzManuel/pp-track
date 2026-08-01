import { describe, expect, it } from "vitest";
import { toArsTicker, toUsdTicker } from "./yahoo-finance.js";

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
