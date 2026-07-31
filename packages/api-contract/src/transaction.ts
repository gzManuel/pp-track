import { z } from "zod";
import { decimalString, isoDateTime } from "./primitives.js";
import { transactionTypeSchema } from "./enums.js";

/** A transaction as returned by the create/update/list endpoints. */
export const transactionSchema = z.object({
  id: z.uuid(),
  portfolioId: z.uuid(),
  assetId: z.uuid(),
  type: transactionTypeSchema,
  quantity: decimalString,
  price: decimalString,
  fee: decimalString,
  currency: z.string(),
  transactedAt: isoDateTime,
  notes: z.string().nullable(),
  createdAt: isoDateTime,
  asset: z.object({ ticker: z.string(), name: z.string() }),
});

export type Transaction = z.infer<typeof transactionSchema>;

/**
 * One page of `GET /api/portfolios/:id/transactions`. `nextCursor` is the id to
 * pass back as `?cursor=`, or null when the last page has been reached.
 */
export const transactionPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.uuid().nullable(),
});

export type TransactionPage = z.infer<typeof transactionPageSchema>;

/** Query string of the transactions list endpoint. */
export const transactionListQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
