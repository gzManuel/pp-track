import { describe, expect, it } from "vitest";
import { costBasisFor, displayTicker, parseDisplayCurrency, transactionPriceIn } from "./currency";
import type { RawHolding } from "./types";

describe("parseDisplayCurrency", () => {
  it.each([
    ["ARS", "ARS"],
    ["ccl", "CCL"],
    ["mep", "MEP"],
  ])("accepts %s", (input, expected) => {
    expect(parseDisplayCurrency(input)).toBe(expected);
  });

  it.each([null, undefined, "", "USD", "nonsense"])("falls back to MEP for %s", (input) => {
    expect(parseDisplayCurrency(input)).toBe("MEP");
  });
});

describe("costBasisFor", () => {
  const holding = {
    avgCostBasis: "100",
    avgCostBasisArs: "150000",
    avgCostBasisCcl: "95",
  } as RawHolding;

  it("picks the stored column rather than converting", () => {
    expect(costBasisFor(holding, "MEP")).toBe(100);
    expect(costBasisFor(holding, "ARS")).toBe(150000);
    expect(costBasisFor(holding, "CCL")).toBe(95);
  });
});

describe("transactionPriceIn", () => {
  const arsTrade = { price: "1909.62", currency: "ARS" as const, mepRate: "1449.4", cclRate: "1501.95" };

  it("returns the entered price unchanged in its own currency", () => {
    expect(transactionPriceIn(arsTrade, "ARS")).toBe(1909.62);
  });

  it("derives the other currencies from the rate snapshot", () => {
    expect(transactionPriceIn(arsTrade, "MEP")).toBeCloseTo(1909.62 / 1449.4, 10);
    expect(transactionPriceIn(arsTrade, "CCL")).toBeCloseTo(1909.62 / 1501.95, 10);
  });

  it("converts a CCL trade through pesos", () => {
    const ccl = { price: "100", currency: "CCL" as const, mepRate: "2", cclRate: "4" };
    expect(transactionPriceIn(ccl, "ARS")).toBe(400);
    expect(transactionPriceIn(ccl, "MEP")).toBe(200);
  });

  it("agrees with the server's derivation for a MEP trade", () => {
    const mep = { price: "100", currency: "MEP" as const, mepRate: "2", cclRate: "4" };
    expect(transactionPriceIn(mep, "ARS")).toBe(200);
    expect(transactionPriceIn(mep, "CCL")).toBe(50);
  });

  it("returns null when a legacy row has no rate snapshot", () => {
    const legacy = { price: "100", currency: "MEP" as const, mepRate: null, cclRate: null };
    expect(transactionPriceIn(legacy, "ARS")).toBeNull();
    // ...but its own currency needs no rate, so it still renders.
    expect(transactionPriceIn(legacy, "MEP")).toBe(100);
  });

  it("returns null rather than dividing by a zero rate", () => {
    const bad = { price: "100", currency: "ARS" as const, mepRate: "0", cclRate: "4" };
    expect(transactionPriceIn(bad, "MEP")).toBeNull();
  });
});

describe("displayTicker", () => {
  it("drops the BYMA suffix and flags the row as a CEDEAR", () => {
    expect(displayTicker("SPY.BA")).toEqual({ label: "SPY", isCedear: true });
  });

  it("leaves a plain listing alone", () => {
    expect(displayTicker("AAPL")).toEqual({ label: "AAPL", isCedear: false });
  });
});
