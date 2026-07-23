import { describe, expect, it } from "vitest";
import { toArsTicker, toUsdTicker } from "./yahoo-finance.js";

describe("toArsTicker", () => {
  it("strips the D from a USD CEDEAR variant", () => {
    expect(toArsTicker("SPYD.BA")).toBe("SPY.BA");
  });

  it("passes through an ARS BYMA ticker", () => {
    expect(toArsTicker("SPY.BA")).toBe("SPY.BA");
  });

  it("passes through non-BYMA tickers, even ones ending in D", () => {
    expect(toArsTicker("AAPL")).toBe("AAPL");
    expect(toArsTicker("MCD")).toBe("MCD");
  });

  it("matches the suffix case-insensitively and canonicalizes it to .BA", () => {
    expect(toArsTicker("spyd.ba")).toBe("spy.BA");
  });
});

describe("toUsdTicker", () => {
  it("adds the D to a peso BYMA ticker", () => {
    expect(toUsdTicker("SPY.BA")).toBe("SPYD.BA");
  });

  it("passes through an existing USD variant", () => {
    expect(toUsdTicker("SPYD.BA")).toBe("SPYD.BA");
  });

  it("passes through non-BYMA tickers", () => {
    expect(toUsdTicker("AAPL")).toBe("AAPL");
  });

  it("round-trips with toArsTicker", () => {
    expect(toArsTicker(toUsdTicker("GGAL.BA"))).toBe("GGAL.BA");
  });
});
