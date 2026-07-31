import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { inCurrency, toMoney } from "./currency.js";
import { CURRENCIES } from "@repo/api-contract";

const D = (v: string | number) => new Prisma.Decimal(v);
const RATES = { mepRate: D("1449.4"), cclRate: D("1501.95") };

describe("toMoney", () => {
  it("returns the entered amount untouched in its own currency", () => {
    // The invariant the whole storage model rests on: a trade reports back the
    // exact price that was typed in, never price/rate*rate.
    const amount = D("1234.56789012");
    for (const currency of CURRENCIES) {
      expect(inCurrency(toMoney(amount, currency, RATES), currency).toString()).toBe("1234.56789012");
    }
  });

  it("converts pesos into both dollars", () => {
    const money = toMoney(D("2899"), "ARS", { mepRate: D(2), cclRate: D(4) });
    expect(money.ars.toString()).toBe("2899");
    expect(money.mep.toString()).toBe("1449.5");
    expect(money.ccl.toString()).toBe("724.75");
  });

  it("converts MEP dollars through pesos into CCL", () => {
    // 100 MEP -> 200 ARS at mep=2 -> 50 CCL at ccl=4.
    const money = toMoney(D(100), "MEP", { mepRate: D(2), cclRate: D(4) });
    expect(money.ars.toString()).toBe("200");
    expect(money.ccl.toString()).toBe("50");
  });

  it("converts CCL dollars through pesos into MEP", () => {
    // 100 CCL -> 400 ARS at ccl=4 -> 200 MEP at mep=2.
    const money = toMoney(D(100), "CCL", { mepRate: D(2), cclRate: D(4) });
    expect(money.ars.toString()).toBe("400");
    expect(money.mep.toString()).toBe("200");
  });

  it("round-trips between the two dollars consistently", () => {
    const asMep = toMoney(D(100), "CCL", RATES).mep;
    expect(toMoney(asMep, "MEP", RATES).ccl.toFixed(8)).toBe("100.00000000");
  });

  it("refuses a non-positive rate instead of dividing by it", () => {
    expect(() => toMoney(D(100), "ARS", { mepRate: D(0), cclRate: D(4) })).toThrow(/Invalid FX rates/);
    expect(() => toMoney(D(100), "ARS", { mepRate: D(2), cclRate: D(-1) })).toThrow(/Invalid FX rates/);
  });

  it("keeps precision that a float conversion would lose", () => {
    const money = toMoney(D("0.1"), "ARS", { mepRate: D("0.1"), cclRate: D("0.2") });
    expect(money.mep.toString()).toBe("1"); // not 0.9999999999999999
  });
});
