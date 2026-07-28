import { z } from "zod";
import { isoDateTime } from "./primitives.js";

/**
 * One item of the `GET /api/prices` batch response.
 *
 * The batch settles per ticker, so an item is either a quote or an `error` —
 * every field is optional because both shapes share this schema. A failed
 * lookup never fails the whole request.
 */
export const priceResultSchema = z.object({
  /** Always the ticker as requested, so callers can match results to inputs. */
  ticker: z.string(),
  price: z.string().optional(),
  currency: z.string().optional(),
  recordedAt: isoDateTime.optional(),
  /** True when served from the price-snapshot cache rather than a live fetch. */
  cached: z.boolean().optional(),
  /** ARS-per-USD rate applied server-side; present only for `?currency=ARS`. */
  mepRate: z.string().optional(),
  error: z.string().optional(),
});

export type PriceResult = z.infer<typeof priceResultSchema>;

/** Query string of the prices endpoint. `tickers` is a comma-separated list. */
export const priceQuerySchema = z.object({
  tickers: z.string().min(1, "tickers query param is required"),
  currency: z.string().optional(),
});

export type PriceQuery = z.infer<typeof priceQuerySchema>;
