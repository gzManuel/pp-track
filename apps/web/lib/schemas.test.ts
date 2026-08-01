import { describe, expect, it } from "vitest";
import { toTransactionPayload, transactionFormSchema, transactionPayloadSchema, type TransactionFormValues } from "./schemas";

const formValues: TransactionFormValues = {
  portfolioId: "p1",
  ticker: "AAPL",
  type: "BUY",
  quantity: "10",
  price: "150.50",
  currency: "MEP",
  transactedAt: "2026-07-22",
  fee: "",
  notes: "",
};

describe("transactionFormSchema", () => {
  it("should reject non-numeric quantity strings", () => {
    expect(transactionFormSchema.safeParse({ ...formValues, quantity: "abc" }).success).toBe(false);
  });

  it("should reject zero and negative quantities", () => {
    expect(transactionFormSchema.safeParse({ ...formValues, quantity: "0" }).success).toBe(false);
    expect(transactionFormSchema.safeParse({ ...formValues, price: "-1" }).success).toBe(false);
  });

  it("should accept decimal string amounts", () => {
    expect(transactionFormSchema.safeParse({ ...formValues, quantity: "0.05" }).success).toBe(true);
  });
});

describe("toTransactionPayload", () => {
  it("should convert string amounts to numbers", () => {
    const payload = toTransactionPayload(formValues);
    expect(payload.quantity).toBe(10);
    expect(payload.price).toBe(150.5);
  });

  it("should normalize empty fee and notes to undefined", () => {
    const payload = toTransactionPayload(formValues);
    expect(payload.fee).toBeUndefined();
    expect(payload.notes).toBeUndefined();
  });

  it("should trim notes and drop whitespace-only notes", () => {
    expect(toTransactionPayload({ ...formValues, notes: "  hello  " }).notes).toBe("hello");
    expect(toTransactionPayload({ ...formValues, notes: "   " }).notes).toBeUndefined();
  });

  it("should produce a payload the server-side schema accepts", () => {
    const payload = toTransactionPayload({ ...formValues, fee: "1.25", notes: "note" });
    expect(transactionPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

describe("transactionPayloadSchema", () => {
  it("should reject a malformed date", () => {
    const payload = { ...toTransactionPayload(formValues), transactedAt: "22/07/2026" };
    expect(transactionPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("should reject an unknown currency", () => {
    const payload = { ...toTransactionPayload(formValues), currency: "EUR" };
    expect(transactionPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
