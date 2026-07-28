import { z } from "zod";

/** One suggestion from `GET /api/assets/search` (the ticker autocomplete). */
export const assetSearchResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string().nullable(),
  type: z.string(),
  /** `portfolio` results are assets the user already owns; they rank first. */
  source: z.enum(["portfolio", "yahoo"]),
});

export type AssetSearchResult = z.infer<typeof assetSearchResultSchema>;

/** Query string of the asset search endpoint. */
export const assetSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export type AssetSearchQuery = z.infer<typeof assetSearchQuerySchema>;
