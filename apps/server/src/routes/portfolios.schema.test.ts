import { describe, expect, it } from "vitest";

// portfolios.ts transitively imports env.ts — provide required vars first.
process.env.INTERNAL_API_SECRET ??= "test-secret-value";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { createTransactionBody } = await import("./portfolios.js");

const base = {
  ticker: "AAPL",
  type: "BUY",
  quantity: 1,
  price: 100,
  currency: "USD",
  transactedAt: "2026-07-22",
};

describe("createTransactionBody", () => {
  it("anchors a bare YYYY-MM-DD at noon UTC so the calendar day never shifts", () => {
    const parsed = createTransactionBody.parse(base);
    expect(parsed.transactedAt.toISOString()).toBe("2026-07-22T12:00:00.000Z");
  });

  it("passes full ISO timestamps through date coercion untouched", () => {
    const parsed = createTransactionBody.parse({ ...base, transactedAt: "2026-07-22T03:30:00.000Z" });
    expect(parsed.transactedAt.toISOString()).toBe("2026-07-22T03:30:00.000Z");
  });

  it("normalizes lowercase transaction types", () => {
    const parsed = createTransactionBody.parse({ ...base, type: "sell" });
    expect(parsed.type).toBe("SELL");
  });

  it("rejects unknown transaction types", () => {
    expect(() => createTransactionBody.parse({ ...base, type: "SHORT" })).toThrow();
  });

  it("rejects non-positive quantities", () => {
    expect(() => createTransactionBody.parse({ ...base, quantity: 0 })).toThrow();
    expect(() => createTransactionBody.parse({ ...base, quantity: -1 })).toThrow();
  });

  it("rejects malformed dates", () => {
    expect(() => createTransactionBody.parse({ ...base, transactedAt: "22/07/2026" })).toThrow();
  });
});
