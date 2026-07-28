import { z } from "zod";

/**
 * Closed value sets that appear in requests, responses, and the database enum.
 * Previously spelled out in the server routes, the web form schema, and the web
 * payload schema independently.
 */

/** Mirrors the `TransactionType` enum in `schema.prisma`. */
export const TRANSACTION_TYPES = ["BUY", "SELL", "DIVIDEND", "FEE"] as const;

export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);

export type TransactionType = z.infer<typeof transactionTypeSchema>;

/** Types a user can log by hand; dividends and fees are recorded elsewhere. */
export const LOGGABLE_TRANSACTION_TYPES = ["BUY", "SELL"] as const;

export const loggableTransactionTypeSchema = z.enum(LOGGABLE_TRANSACTION_TYPES);

export type LoggableTransactionType = z.infer<typeof loggableTransactionTypeSchema>;

/** Currencies a transaction may be entered in. Storage is normalized to USD. */
export const SUPPORTED_CURRENCIES = ["USD", "ARS"] as const;

export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

export type Currency = z.infer<typeof currencySchema>;
