import { describe, expect, it } from "vitest";
import { decimalString, isoDateTime } from "./primitives.js";

/**
 * These guarantees are what let the server serialize with these schemas while
 * the web app types itself from them. If either stops holding, the two sides
 * have silently drifted again.
 */

// Stands in for a Prisma.Decimal without importing @prisma/client here.
class FakeDecimal {
  constructor(private readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

describe("decimalString", () => {
  it("stringifies a Decimal-like value without losing precision", () => {
    expect(decimalString.parse(new FakeDecimal("183.33333333"))).toBe("183.33333333");
  });

  it("keeps trailing-zero-free string input as-is", () => {
    expect(decimalString.parse("10.5")).toBe("10.5");
  });

  it("accepts numbers", () => {
    expect(decimalString.parse(100)).toBe("100");
  });

  it.each([[{}], [[]], [null], [undefined], [true]])("rejects %s so a wrong shape fails serialization loudly", (value) => {
    expect(decimalString.safeParse(value).success).toBe(false);
  });
});

describe("isoDateTime", () => {
  const date = new Date("2026-01-15T12:00:00.000Z");

  it("emits exactly what JSON.stringify would have produced for a Date", () => {
    // The payload must be byte-identical to the pre-contract behaviour, where
    // Fastify stringified the Date itself.
    const viaJson = JSON.parse(JSON.stringify({ d: date })) as { d: string };
    expect(isoDateTime.parse(date)).toBe(viaJson.d);
  });

  it("passes an ISO string through unchanged", () => {
    expect(isoDateTime.parse("2026-01-15T12:00:00.000Z")).toBe("2026-01-15T12:00:00.000Z");
  });

  it("rejects a bare calendar date", () => {
    expect(isoDateTime.safeParse("2026-01-15").success).toBe(false);
  });

  it("infers as a string, not a Date", () => {
    const parsed: string = isoDateTime.parse(date);
    expect(typeof parsed).toBe("string");
  });
});
