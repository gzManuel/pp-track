import { describe, expect, it } from "vitest";
import { costBasisFor, currencySymbol, displayTicker, parseDisplayCurrency, parseEntryCurrency, transactionPriceIn } from "./currency";
import type { RawHolding } from "./types";

describe("parseDisplayCurrency", () => {
  it.each([
    ["ARS", "ARS"],
    ["ccl", "CCL"],
    ["mep", "MEP"],
  ])("should accept %s", (input, expected) => {
    expect(parseDisplayCurrency(input)).toBe(expected);
  });

  it.each([null, undefined, "", "USD", "nonsense"])("should fall back to MEP for %s", (input) => {
    expect(parseDisplayCurrency(input)).toBe("MEP");
  });
});

describe("costBasisFor", () => {
  const holding = {
    avgCostBasis: "100",
    avgCostBasisArs: "150000",
    avgCostBasisCcl: "95",
  } as RawHolding;

  it("should pick the stored column rather than converting", () => {
    expect(costBasisFor(holding, "MEP")).toBe(100);
    expect(costBasisFor(holding, "ARS")).toBe(150000);
    expect(costBasisFor(holding, "CCL")).toBe(95);
  });
});

describe("transactionPriceIn", () => {
  const arsTrade = { price: "1909.62", currency: "ARS" as const, mepRate: "1449.4", cclRate: "1501.95" };

  it("should return the entered price unchanged in its own currency", () => {
    expect(transactionPriceIn(arsTrade, "ARS")).toBe(1909.62);
  });

  it("should derive the other currencies from the rate snapshot", () => {
    expect(transactionPriceIn(arsTrade, "MEP")).toBeCloseTo(1909.62 / 1449.4, 10);
    expect(transactionPriceIn(arsTrade, "CCL")).toBeCloseTo(1909.62 / 1501.95, 10);
  });

  it("should convert a CCL trade through pesos", () => {
    const ccl = { price: "100", currency: "CCL" as const, mepRate: "2", cclRate: "4" };
    expect(transactionPriceIn(ccl, "ARS")).toBe(400);
    expect(transactionPriceIn(ccl, "MEP")).toBe(200);
  });

  it("should agree with the server's derivation for a MEP trade", () => {
    const mep = { price: "100", currency: "MEP" as const, mepRate: "2", cclRate: "4" };
    expect(transactionPriceIn(mep, "ARS")).toBe(200);
    expect(transactionPriceIn(mep, "CCL")).toBe(50);
  });

  it("should return null when a legacy row has no rate snapshot", () => {
    const legacy = { price: "100", currency: "MEP" as const, mepRate: null, cclRate: null };
    expect(transactionPriceIn(legacy, "ARS")).toBeNull();
    // ...but its own currency needs no rate, so it still renders.
    expect(transactionPriceIn(legacy, "MEP")).toBe(100);
  });

  it("should return null rather than dividing by a zero rate", () => {
    const bad = { price: "100", currency: "ARS" as const, mepRate: "0", cclRate: "4" };
    expect(transactionPriceIn(bad, "MEP")).toBeNull();
  });
});

describe("displayTicker", () => {
  it("should drop the BYMA suffix and flag the row as a CEDEAR", () => {
    expect(displayTicker("SPY.BA")).toEqual({ label: "SPY", isCedear: true });
  });

  it("should leave a plain listing alone", () => {
    expect(displayTicker("AAPL")).toEqual({ label: "AAPL", isCedear: false });
  });
});

describe("parseEntryCurrency", () => {
  it("should validate and normalize input to Currency type", () => {
    expect(parseEntryCurrency("ARS")).toBe("ARS");
    expect(parseEntryCurrency("mep")).toBe("MEP");
    expect(parseEntryCurrency("CCL")).toBe("CCL");
  });

  it("should fall back to MEP on invalid currency", () => {
    expect(parseEntryCurrency("USD")).toBe("MEP");
    expect(parseEntryCurrency("")).toBe("MEP");
    expect(parseEntryCurrency("INVALID")).toBe("MEP");
  });
});

describe("currencySymbol", () => {
  it("should return $ for ARS currency", () => {
    expect(currencySymbol("ARS")).toBe("$");
  });

  it("should return US$ for MEP currency", () => {
    expect(currencySymbol("MEP")).toBe("US$");
  });

  it("should return US$ for CCL currency", () => {
    expect(currencySymbol("CCL")).toBe("US$");
  });
});
