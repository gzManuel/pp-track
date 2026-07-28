/**
 * Domain types for data coming from the Fastify backend.
 *
 * The API shapes themselves live in `@repo/api-contract` and are re-exported
 * here so existing `@/lib/types` imports keep working. They are the *wire*
 * shapes: `Decimal` columns arrive as strings (precision-preserving transport)
 * and timestamps as ISO strings — convert to `number`/`Date` only at
 * display/aggregation time.
 *
 * Only types with no server-side counterpart are declared below.
 */

import type { Holding } from "@repo/api-contract";

export type {
  AssetSearchResult,
  Currency,
  Holding,
  Portfolio,
  PriceResult,
  Transaction,
  TransactionPage,
  TransactionType,
  User,
} from "@repo/api-contract";

/**
 * The holding shape as it arrives from the API, named to stay distinct from the
 * enriched, display-ready `EnrichedHolding` below.
 */
export type RawHolding = Holding;

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
