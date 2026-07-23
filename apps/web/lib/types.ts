/**
 * Shared API/domain types for data coming from the Fastify backend. Decimal
 * columns arrive as strings (precision-preserving transport); convert to
 * `number` only at display/aggregation time.
 */

export interface Portfolio {
  id: string;
  name: string;
  isDefault: boolean;
  currency: string;
}

export interface RawHolding {
  id: string;
  quantity: string;
  avgCostBasis: string;
  asset: { ticker: string; name: string; currency: string; assetType: string };
}

export interface Transaction {
  id: string;
  type: string;
  quantity: string;
  price: string;
  currency: string;
  fee: string;
  notes: string | null;
  transactedAt: string;
  asset: { ticker: string; name: string };
}

/** One item of the /api/prices batch response; failed lookups carry `error`. */
export interface PriceResult {
  ticker: string;
  price?: string;
  currency?: string;
  recordedAt?: string;
  cached?: boolean;
  /** ARS-per-USD rate applied server-side; present only for ?currency=ARS. */
  mepRate?: string;
  error?: string;
}

/** A merged position with display-ready numbers, in the requested currency. */
export interface EnrichedHolding {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  assetType: string;
  shares: number;
  avgCost: number;
  costBasis: number;
  currentPrice: number | null;
  marketValue: number | null;
  gain: number | null;
  gainPct: number | null;
  portfolioPct: number | null;
}
