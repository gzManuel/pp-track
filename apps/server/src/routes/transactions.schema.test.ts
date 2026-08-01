import { describe, expect, it } from "vitest";
import { createTransactionBody } from "./transactions.js";

const base = {
  ticker: "AAPL",
  type: "BUY",
  quantity: 1,
  price: 100,
  currency: "MEP",
  transactedAt: "2026-07-22",
};

describe("createTransactionBody", () => {
  it("should anchor a bare YYYY-MM-DD at noon UTC so the calendar day never shifts", () => {
    const parsed = createTransactionBody.parse(base);
    expect(parsed.transactedAt.toISOString()).toBe("2026-07-22T12:00:00.000Z");
  });

  it("should pass full ISO timestamps through date coercion untouched", () => {
    const parsed = createTransactionBody.parse({ ...base, transactedAt: "2026-07-22T03:30:00.000Z" });
    expect(parsed.transactedAt.toISOString()).toBe("2026-07-22T03:30:00.000Z");
  });

  it("should normalize lowercase transaction types", () => {
    const parsed = createTransactionBody.parse({ ...base, type: "sell" });
    expect(parsed.type).toBe("SELL");
  });

  it("should reject unknown transaction types", () => {
    expect(() => createTransactionBody.parse({ ...base, type: "SHORT" })).toThrow();
  });

  it("should reject non-positive quantities", () => {
    expect(() => createTransactionBody.parse({ ...base, quantity: 0 })).toThrow();
    expect(() => createTransactionBody.parse({ ...base, quantity: -1 })).toThrow();
  });

  it("should reject malformed dates", () => {
    expect(() => createTransactionBody.parse({ ...base, transactedAt: "22/07/2026" })).toThrow();
  });
});
