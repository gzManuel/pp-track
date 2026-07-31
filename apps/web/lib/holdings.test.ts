import { describe, expect, it } from "vitest";
import type { Currency } from "@repo/api-contract";
import { enrichPositions, mergeByTicker, summarizeHoldings, type Position, type PriceData } from "./holdings";
import type { RawHolding } from "./types";

/**
 * A holding whose MEP basis is `avgCostBasis`, with the ARS and CCL bases at
 * 1000x and 1.25x of it — distinct multiples so a test picking the wrong column
 * fails loudly rather than coincidentally matching.
 */
function raw(ticker: string, quantity: string, avgCostBasis: string, currency = "USD"): RawHolding {
  const mep = Number(avgCostBasis);
  return {
    id: `h-${ticker}-${quantity}`,
    portfolioId: "00000000-0000-4000-8000-000000000001",
    assetId: `asset-${ticker}`,
    quantity,
    avgCostBasis,
    avgCostBasisArs: String(mep * 1000),
    avgCostBasisCcl: String(mep * 1.25),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    asset: { ticker, name: ticker, currency, assetType: "EQUITY" },
  };
}

function priceData(prices: Record<string, number>, currency: Currency = "MEP"): PriceData {
  return { prices: new Map(Object.entries(prices)), currency };
}

describe("mergeByTicker", () => {
  it("collapses the same asset across portfolios with summed shares and blended cost", () => {
    const positions = mergeByTicker([raw("AAPL", "10", "100"), raw("AAPL", "10", "200")]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.shares).toBe(20);
    expect(positions[0]?.costBasis).toBe(3000);
  });

  it("keeps distinct tickers separate", () => {
    const positions = mergeByTicker([raw("AAPL", "10", "100"), raw("MSFT", "5", "300")]);
    expect(positions.map((p) => p.ticker).sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("takes the basis from the requested currency column", () => {
    const holdings = [raw("AAPL", "10", "100")];
    expect(mergeByTicker(holdings, "MEP")[0]?.costBasis).toBe(1000);
    expect(mergeByTicker(holdings, "ARS")[0]?.costBasis).toBe(1_000_000);
    expect(mergeByTicker(holdings, "CCL")[0]?.costBasis).toBe(1250);
  });
});

describe("enrichPositions", () => {
  const position: Position = {
    id: "p1",
    ticker: "AAPL",
    name: "Apple",
    currency: "USD",
    assetType: "EQUITY",
    shares: 10,
    costBasis: 1000,
  };

  it("computes market value, gain, and pct from the price map", () => {
    const [h] = enrichPositions([position], priceData({ AAPL: 150 }));
    expect(h?.marketValue).toBe(1500);
    expect(h?.gain).toBe(500);
    expect(h?.gainPct).toBe(50);
    expect(h?.portfolioPct).toBe(100);
  });

  it("propagates nulls when the price is missing", () => {
    const [h] = enrichPositions([position], priceData({}));
    expect(h?.currentPrice).toBeNull();
    expect(h?.marketValue).toBeNull();
    expect(h?.gain).toBeNull();
    expect(h?.gainPct).toBeNull();
    expect(h?.portfolioPct).toBeNull();
  });

  it("never re-converts the basis: both sides already share the view currency", () => {
    // The ARS position carries the pesos actually paid, and the price came back
    // in ARS. Applying an FX rate here (as the old code did) would double-count.
    const arsPosition = { ...position, costBasis: 1_000_000 };
    const [h] = enrichPositions([arsPosition], priceData({ AAPL: 150_000 }, "ARS"));
    expect(h?.costBasis).toBe(1_000_000);
    expect(h?.marketValue).toBe(1_500_000);
    expect(h?.gain).toBe(500_000);
    expect(h?.gainPct).toBe(50);
  });

  it("guards gainPct when cost basis is zero", () => {
    const free = { ...position, costBasis: 0 };
    const [h] = enrichPositions([free], priceData({ AAPL: 150 }));
    expect(h?.gain).toBe(1500);
    expect(h?.gainPct).toBeNull();
  });

  it("computes portfolioPct across positions", () => {
    const other: Position = { ...position, id: "p2", ticker: "MSFT", shares: 10, costBasis: 1000 };
    const enriched = enrichPositions([position, other], priceData({ AAPL: 300, MSFT: 100 }));
    expect(enriched.find((h) => h.ticker === "AAPL")?.portfolioPct).toBe(75);
    expect(enriched.find((h) => h.ticker === "MSFT")?.portfolioPct).toBe(25);
  });
});

describe("summarizeHoldings", () => {
  it("totals invested and market value", () => {
    const summary = summarizeHoldings([raw("AAPL", "10", "100")], new Map([["AAPL", 150]]));
    expect(summary.totalInvested).toBe(1000);
    expect(summary.totalMarketValue).toBe(1500);
    expect(summary.gain).toBe(500);
    expect(summary.gainPct).toBe(50);
  });

  it("falls back to cost basis when a price is missing", () => {
    const summary = summarizeHoldings([raw("AAPL", "10", "100"), raw("MSFT", "10", "50")], new Map([["AAPL", 150]]));
    expect(summary.totalMarketValue).toBe(1500 + 500); // MSFT priced at cost
    expect(summary.gain).toBe(500);
  });

  it("returns null gainPct for an empty portfolio", () => {
    const summary = summarizeHoldings([], new Map());
    expect(summary.gainPct).toBeNull();
  });

  it("totals in the requested currency", () => {
    const holdings = [raw("AAPL", "10", "100")];
    expect(summarizeHoldings(holdings, new Map([["AAPL", 150]]), "MEP").totalInvested).toBe(1000);
    expect(summarizeHoldings(holdings, new Map([["AAPL", 150_000]]), "ARS").totalInvested).toBe(1_000_000);
  });
});
