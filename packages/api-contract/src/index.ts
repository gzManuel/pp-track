/**
 * The HTTP contract between `apps/server` and `apps/web`.
 *
 * The server validates and serializes its responses with these schemas; the web
 * app derives its domain types from the same definitions via `z.infer`. Before
 * this package the two described the same payloads independently, so renaming a
 * server field type-checked cleanly on both sides and broke only at runtime.
 *
 * Conventions:
 * - `*Schema` is the Zod schema; the matching bare type is its inferred output.
 * - Response types are the *wire* shape: `Decimal` columns are strings and
 *   timestamps are ISO strings, because that is what actually arrives.
 * - This package must stay free of `@prisma/client` and of any server-only
 *   dependency; it is imported by the browser bundle.
 */

export * from "./primitives.js";
export * from "./enums.js";
export * from "./portfolio.js";
export * from "./transaction.js";
export * from "./asset.js";
export * from "./price.js";
export * from "./user.js";
