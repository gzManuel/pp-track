import { z } from "zod";

/**
 * Zod schemas shared between the client-side forms and the server actions.
 * Server actions are public HTTP endpoints — client-side validation is UX,
 * this file re-used inside the actions is the actual trust boundary.
 */

/** Form-shaped schema (string inputs) used by LogTransactionForm via RHF. */
export const transactionFormSchema = z.object({
  portfolioId: z.string().min(1, "Required"),
  ticker: z.string().min(1, "Required"),
  type: z.enum(["BUY", "SELL"]),
  quantity: z
    .string()
    .min(1, "Required")
    .refine((v) => Number(v) > 0, "Must be positive"),
  price: z
    .string()
    .min(1, "Required")
    .refine((v) => Number(v) > 0, "Must be positive"),
  currency: z.enum(["USD", "ARS"]),
  transactedAt: z.string().min(1, "Required"),
  fee: z.string().optional(),
  notes: z.string().optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

/** Payload the server actions accept (post-conversion, numbers not strings). */
export const transactionPayloadSchema = z.object({
  ticker: z.string().min(1).max(20),
  type: z.enum(["BUY", "SELL", "DIVIDEND", "FEE"]),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  currency: z.enum(["USD", "ARS"]),
  transactedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  fee: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

export type TransactionPayload = z.infer<typeof transactionPayloadSchema>;

export const updateTransactionPayloadSchema = transactionPayloadSchema.extend({
  portfolioId: z.uuid().optional(),
});

export type UpdateTransactionPayload = z.infer<typeof updateTransactionPayloadSchema>;

export const portfolioNameSchema = z.string().trim().min(1, "Required").max(100);

/**
 * Convert validated form values (strings from inputs) into the numeric payload
 * the server actions accept. Kept pure so it is unit-testable; also the single
 * place where empty-string optionals are normalized to `undefined` (so the DB
 * never stores "" notes/fees).
 */
export function toTransactionPayload(values: TransactionFormValues): TransactionPayload {
  return {
    ticker: values.ticker,
    type: values.type,
    quantity: Number(values.quantity),
    price: Number(values.price),
    currency: values.currency,
    transactedAt: values.transactedAt,
    fee: values.fee ? Number(values.fee) : undefined,
    notes: values.notes?.trim() ? values.notes.trim() : undefined,
  };
}
