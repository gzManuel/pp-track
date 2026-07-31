/**
 * Server-side holdings/price helpers shared by the dashboard and portfolios
 * pages — one implementation of "fetch holdings → price map → cost basis /
 * market value / gain" instead of per-page copies.
 */

import type { Currency } from "@repo/api-contract";
import { costBasisFor, DEFAULT_CURRENCY } from "./currency";
import { serverFetchJson } from "./server-api";
import type { EnrichedHolding, PriceResult, RawHolding } from "./types";

export interface PriceData {
  /** Latest price per requested ticker; failed lookups are simply absent. */
  prices: Map<string, number>;
  /** The currency the prices are quoted in. */
  currency: Currency;
}

export function fetchHoldings(userId: string, portfolioId: string): Promise<RawHolding[]> {
  return serverFetchJson<RawHolding[]>(`/api/portfolios/${portfolioId}/holdings`, { userId });
}

/** One /api/prices call for the whole ticker set (deduped). */
export async function fetchPriceData(tickers: string[], currency: Currency = DEFAULT_CURRENCY): Promise<PriceData> {
  const prices = new Map<string, number>();

  const unique = [...new Set(tickers)].filter(Boolean);
  if (unique.length === 0) return { prices, currency };

  const results = await serverFetchJson<PriceResult[]>(`/api/prices?tickers=${encodeURIComponent(unique.join(","))}&currency=${currency}`);
  for (const r of results) {
    if (r.price) prices.set(r.ticker, Number(r.price));
  }
  return { prices, currency };
}

export interface Position {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  assetType: string;
  shares: number;
  /** Total cost basis in the asset's storage currency (normally USD). */
  costBasis: number;
}

/**
 * Merge raw holdings by ticker so the same asset held in several portfolios
 * collapses into a single position with summed shares and blended cost basis.
 *
 * The basis is taken in `currency` — the amount actually paid in it — so the
 * merge happens in one currency throughout and never mixes units.
 */
export function mergeByTicker(rawHoldings: RawHolding[], currency: Currency = DEFAULT_CURRENCY): Position[] {
  const byTicker = new Map<string, Position>();
  for (const h of rawHoldings) {
    const shares = Number(h.quantity);
    const costBasis = shares * costBasisFor(h, currency);
    const existing = byTicker.get(h.asset.ticker);
    if (existing) {
      existing.shares += shares;
      existing.costBasis += costBasis;
    } else {
      byTicker.set(h.asset.ticker, {
        id: h.id,
        ticker: h.asset.ticker,
        name: h.asset.name,
        currency: h.asset.currency,
        assetType: h.asset.assetType,
        shares,
        costBasis,
      });
    }
  }
  return [...byTicker.values()];
}

/**
 * Attach prices and derived gain figures.
 *
 * No FX conversion happens here any more. `positions` already carry the cost
 * actually paid in the display currency, and `priceData` was fetched in that
 * same currency, so both sides of the gain are natively like-for-like. This is
 * what makes the ARS view show real peso performance instead of a dollar basis
 * revalued at today's rate.
 */
export function enrichPositions(positions: Position[], priceData: PriceData): EnrichedHolding[] {
  const enriched: EnrichedHolding[] = positions.map((p) => {
    const costBasis = p.costBasis;
    const avgCost = p.shares !== 0 ? costBasis / p.shares : 0;
    const currentPrice = priceData.prices.get(p.ticker) ?? null;
    const marketValue = currentPrice !== null ? p.shares * currentPrice : null;
    const gain = marketValue !== null ? marketValue - costBasis : null;
    const gainPct = gain !== null && costBasis !== 0 ? (gain / costBasis) * 100 : null;
    return {
      id: p.id,
      ticker: p.ticker,
      name: p.name,
      currency: p.currency,
      assetType: p.assetType,
      shares: p.shares,
      avgCost,
      costBasis,
      currentPrice,
      marketValue,
      gain,
      gainPct,
      portfolioPct: null,
    };
  });

  const totalMarketValue = enriched.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
  for (const h of enriched) {
    h.portfolioPct = totalMarketValue > 0 && h.marketValue !== null ? (h.marketValue / totalMarketValue) * 100 : null;
  }
  return enriched;
}

export interface PortfolioSummary {
  totalInvested: number;
  totalMarketValue: number;
  gain: number;
  gainPct: number | null;
}

/**
 * Aggregate totals for one portfolio's holdings, in `currency`. A position with
 * no price falls back to its cost basis so the market value isn't understated.
 *
 * Takes the basis in the same currency the prices were fetched in, for the same
 * reason as `enrichPositions` — the two must not be mixed.
 */
export function summarizeHoldings(
  rawHoldings: RawHolding[],
  prices: Map<string, number>,
  currency: Currency = DEFAULT_CURRENCY,
): PortfolioSummary {
  let totalInvested = 0;
  let totalMarketValue = 0;
  for (const h of rawHoldings) {
    const shares = Number(h.quantity);
    const costBasis = shares * costBasisFor(h, currency);
    const currentPrice = prices.get(h.asset.ticker) ?? null;
    totalInvested += costBasis;
    totalMarketValue += currentPrice !== null ? shares * currentPrice : costBasis;
  }
  const gain = totalMarketValue - totalInvested;
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : null;
  return { totalInvested, totalMarketValue, gain, gainPct };
}
