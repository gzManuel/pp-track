import { z } from "zod";

/**
 * Wire-format primitives shared by every response schema.
 *
 * These are the hinge of the whole package: their *input* is what the server
 * hands the serializer (a `Prisma.Decimal`, a `Date`), and their *output* is
 * what actually travels as JSON (a string). The server validates against them;
 * the web app infers its types from them. One definition, so the two can't drift.
 *
 * Nothing here may import `@prisma/client` — the web app must be able to depend
 * on this package without pulling the database client into its bundle. Hence the
 * structural checks below rather than `z.instanceof(Prisma.Decimal)`.
 */

/**
 * Anything that stringifies to a decimal: a `Prisma.Decimal`, or an already-
 * stringified/numeric value. Deliberately narrow — plain objects and arrays are
 * rejected so a handler returning the wrong shape trips the response-
 * serialization error path instead of emitting `"[object Object]"`.
 */
function isDecimalLike(value: unknown): value is { toString: () => string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { toString } = value as { toString?: unknown };
  return typeof toString === "function" && toString !== Object.prototype.toString;
}

/**
 * A `Decimal(18,8)` column on the wire. Money crosses as a string so no
 * precision is lost to IEEE-754 on the way out; callers convert to `number`
 * only at display/aggregation time.
 */
export const decimalString = z
  .custom<
    string | number | { toString: () => string }
  >((value) => typeof value === "string" || typeof value === "number" || isDecimalLike(value), { message: "Expected a decimal value" })
  .transform((value) => String(value));

/**
 * A timestamp column on the wire, as an ISO-8601 string.
 *
 * Accepts the `Date` the server has in hand and emits exactly what
 * `JSON.stringify` would have produced, so the payload is unchanged — but the
 * inferred type is now honestly `string` rather than `Date`, which is what the
 * client actually receives.
 */
export const isoDateTime = z
  .union([z.date(), z.iso.datetime()])
  .transform((value) => (typeof value === "string" ? value : value.toISOString()));

/** Every error response in the API is this shape. */
export const errorResponseSchema = z.object({ error: z.string() });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
