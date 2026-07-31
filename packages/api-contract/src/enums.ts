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

/**
 * The three ways a trade can be denominated — and, identically, the three views
 * the dashboard offers. Both sets are the same because you can transact in any
 * of them, so there is deliberately no separate "display currency" enum.
 *
 * `MEP` and `CCL` are both US dollars; they differ in *which* dollar (local
 * settlement vs. cable). A plain `USD` value is not offered on purpose: it never
 * said where the dollars were, and the old code silently treated it as MEP.
 *
 * Nothing is converted on write. A transaction stores the amount exactly as
 * entered in one of these currencies, plus the MEP and CCL rates in effect on
 * its date, and the other two views are derived from that.
 */
export const CURRENCIES = ["ARS", "MEP", "CCL"] as const;

export const currencySchema = z.enum(CURRENCIES);

export type Currency = z.infer<typeof currencySchema>;
