import { z } from "zod";
import { decimalString, isoDateTime } from "./primitives.js";

/** A portfolio as returned by `GET /api/portfolios`. */
export const portfolioSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  currency: z.string(),
  isDefault: z.boolean(),
  createdAt: isoDateTime,
});

export type Portfolio = z.infer<typeof portfolioSchema>;

/** Body of `POST /api/portfolios`. */
export const createPortfolioRequestSchema = z.object({
  name: z.string().trim().min(1, "Required").max(100),
});

export type CreatePortfolioRequest = z.infer<typeof createPortfolioRequestSchema>;

/**
 * A position as returned by `GET /api/portfolios/:id/holdings`.
 *
 * `asset` is a deliberate subset of the asset row — response schemas whitelist
 * fields so a future sensitive column stays server-side unless added here.
 */
export const holdingSchema = z.object({
  id: z.uuid(),
  portfolioId: z.uuid(),
  assetId: z.uuid(),
  quantity: decimalString,
  avgCostBasis: decimalString,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  asset: z.object({
    ticker: z.string(),
    name: z.string(),
    currency: z.string(),
    assetType: z.string(),
  }),
});

export type Holding = z.infer<typeof holdingSchema>;
