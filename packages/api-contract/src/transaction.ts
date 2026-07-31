import { z } from "zod";
import { decimalString, isoDateTime } from "./primitives.js";
import { currencySchema, transactionTypeSchema } from "./enums.js";

/** A transaction as returned by the create/update/list endpoints. */
export const transactionSchema = z.object({
  id: z.uuid(),
  portfolioId: z.uuid(),
  assetId: z.uuid(),
  type: transactionTypeSchema,
  quantity: decimalString,
  /** Price and fee as entered, denominated in `currency`. Never converted. */
  price: decimalString,
  fee: decimalString,
  currency: currencySchema,
  /**
   * ARS per USD on `transactedAt`, captured at write time. Together with
   * `currency` these let a client render the trade in any of the three
   * currencies. Null only on legacy rows the backfill could not resolve.
   */
  mepRate: decimalString.nullable(),
  cclRate: decimalString.nullable(),
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
