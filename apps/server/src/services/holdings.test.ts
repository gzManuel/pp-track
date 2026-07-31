import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { computeRebuild, replayPosition, sellOverdrawsAt, toReplayTransaction, type ReplayTransaction } from "./holdings.js";
import { toMoney } from "./currency.js";

const D = (v: string | number) => new Prisma.Decimal(v);

// Rates chosen so the three currencies stay exactly representable in Decimal
// (ARS -> MEP halves, ARS -> CCL quarters), keeping assertions readable.
const RATES = { mepRate: D(2), cclRate: D(4) };

/** A MEP-denominated trade: `value` assertions below read as the MEP column. */
let nextId = 0;
function tx(type: "BUY" | "SELL", quantity: string | number, price: string | number, fee: string | number = 0): ReplayTransaction {
  return {
    id: `t${String(++nextId)}`,
    type,
    quantity: D(quantity),
    price: toMoney(D(price), "MEP", RATES),
    fee: toMoney(D(fee), "MEP", RATES),
  };
}

/** A holding stored at `avgMep`, with the other two bases derived at RATES. */
function holding(quantity: string | number, avgMep: string | number | Prisma.Decimal) {
  const avg = avgMep instanceof Prisma.Decimal ? avgMep : D(avgMep);
  return {
    quantity: D(quantity),
    avgCostBasis: avg,
    avgCostBasisArs: avg.times(RATES.mepRate),
    avgCostBasisCcl: avg.times(RATES.mepRate).div(RATES.cclRate),
  };
}

describe("replayPosition", () => {
  it("accumulates buys with fees into total cost", () => {
    const pos = replayPosition([tx("BUY", 10, 100, 5), tx("BUY", 10, 110, 5)]);
    expect(pos.quantity.toString()).toBe("20");
    // 10*100+5 + 10*110+5 = 2110
    expect(pos.value.mep.toString()).toBe("2110");
  });

  it("keeps the average unchanged on a sell", () => {
    const pos = replayPosition([tx("BUY", 10, 100), tx("BUY", 10, 200), tx("SELL", 5, 500)]);
    // avg before sell = 150; after selling 5 at the running average, value = 15*150
    expect(pos.quantity.toString()).toBe("15");
    expect(pos.value.mep.toString()).toBe("2250");
    expect(pos.value.mep.div(pos.quantity).toString()).toBe("150");
  });

  it("clamps an oversell to zero instead of going negative", () => {
    const pos = replayPosition([tx("BUY", 5, 100), tx("SELL", 10, 100)]);
    expect(pos.quantity.toString()).toBe("0");
    expect(pos.value.mep.toString()).toBe("0");
  });

  it("is exact where binary floats are not (0.1 + 0.2 class)", () => {
    const pos = replayPosition([tx("BUY", "0.1", "3"), tx("BUY", "0.2", "3")]);
    expect(pos.quantity.toString()).toBe("0.3"); // not 0.30000000000000004
    expect(pos.value.mep.toString()).toBe("0.9");
  });

  it("sell against an empty position leaves zero", () => {
    const pos = replayPosition([tx("SELL", 5, 100)]);
    expect(pos.quantity.toString()).toBe("0");
    expect(pos.value.mep.toString()).toBe("0");
  });
});

describe("computeRebuild", () => {
  it("returns null (delete) when the last transaction of a transaction-built holding is removed", () => {
    const only = tx("BUY", 10, 100);
    const result = computeRebuild({
      holding: holding(10, 100),
      explained: [only], // holding is fully explained by this tx
      rebuilt: [], // ... which is being deleted
    });
    expect(result).toBeNull();
  });

  it("preserves an imported base when its unrelated transaction is removed", () => {
    const bought = tx("BUY", 5, 200);
    const result = computeRebuild({
      // 15 shares total: 10 imported at avg 100 blended with 5 bought at 200 -> avg 400/3
      holding: holding(15, D(2000).div(15)),
      explained: [bought],
      rebuilt: [],
    });
    expect(result).not.toBeNull();
    expect(result?.quantity.toString()).toBe("10");
    expect(result?.avgCostBasis.toString()).toBe("100");
  });

  it("replays a backdated buy in chronological order (order-dependent avg cost)", () => {
    // History: BUY 10@100, SELL 5. A backdated BUY 10@50 inserted BEFORE the sell
    // changes the average the sell executes at.
    const early = tx("BUY", 10, 100);
    const sell = tx("SELL", 5, 999);
    const backdated = tx("BUY", 10, 50);
    const chronological = [early, backdated, sell]; // backdated lands before the sell

    const result = computeRebuild({
      // Current holding reflects only early+sell: 5 shares at avg 100.
      holding: holding(5, 100),
      explained: [early, sell],
      rebuilt: chronological,
    });
    expect(result).not.toBeNull();
    expect(result?.quantity.toString()).toBe("15");
    // avg after replay: (10*100 + 10*50) = 1500 over 20 shares -> 75; sell keeps avg
    expect(result?.avgCostBasis.toString()).toBe("75");
  });

  it("treats sub-epsilon residue as zero so a dead holding cannot survive", () => {
    const only = tx("BUY", 10, 100);
    const result = computeRebuild({
      // Stored quantity differs from the replay by rounding residue only.
      holding: holding("10.000000001", 100),
      explained: [only],
      rebuilt: [],
    });
    expect(result).toBeNull();
  });
});

describe("multi-currency replay", () => {
  /** A trade denominated in an arbitrary currency. */
  function txIn(currency: "ARS" | "MEP" | "CCL", type: "BUY" | "SELL", quantity: number, price: number): ReplayTransaction {
    return {
      id: `m${String(++nextId)}`,
      type,
      quantity: D(quantity),
      price: toMoney(D(price), currency, RATES),
      fee: toMoney(D(0), currency, RATES),
    };
  }

  it("accumulates each currency at the amount actually paid in it", () => {
    // 10 shares for 2000 pesos, then 10 more for 100 MEP dollars.
    // At mep=2: the ARS buy is 100 MEP; the MEP buy is 200 ARS.
    const pos = replayPosition([txIn("ARS", "BUY", 10, 200), txIn("MEP", "BUY", 10, 10)]);
    expect(pos.quantity.toString()).toBe("20");
    expect(pos.value.ars.toString()).toBe("2200"); // 2000 paid + 100*2 converted
    expect(pos.value.mep.toString()).toBe("1100"); // 2000/2 converted + 100 paid
    expect(pos.value.ccl.toString()).toBe("550"); //  2000/4 converted + 100*2/4
  });

  it("carries a CCL trade into the other two currencies", () => {
    // 10 shares at 100 cable dollars. At ccl=4 that is 4000 pesos, and at
    // mep=2 those pesos are 2000 MEP dollars.
    const pos = replayPosition([txIn("CCL", "BUY", 10, 100)]);
    expect(pos.value.ccl.toString()).toBe("1000");
    expect(pos.value.ars.toString()).toBe("4000");
    expect(pos.value.mep.toString()).toBe("2000");
  });

  it("reduces all three proportionally on a sell, leaving each average intact", () => {
    const pos = replayPosition([txIn("ARS", "BUY", 10, 200), txIn("ARS", "SELL", 4, 999)]);
    expect(pos.quantity.toString()).toBe("6");
    expect(pos.value.ars.div(pos.quantity).toString()).toBe("200"); // unchanged avg
    expect(pos.value.mep.div(pos.quantity).toString()).toBe("100");
    expect(pos.value.ccl.div(pos.quantity).toString()).toBe("50");
  });

  it("rebuilds all three bases together", () => {
    const buy = txIn("ARS", "BUY", 10, 200);
    const result = computeRebuild({ holding: null, explained: [], rebuilt: [buy] });
    expect(result?.avgCostBasisArs.toString()).toBe("200");
    expect(result?.avgCostBasis.toString()).toBe("100");
    expect(result?.avgCostBasisCcl.toString()).toBe("50");
  });
});

describe("toReplayTransaction", () => {
  const row = {
    id: "t1",
    type: "BUY" as const,
    quantity: D(10),
    price: D("1234.5678"),
    fee: D(0),
    currency: "ARS",
    mepRate: D("1516.3"),
    cclRate: D("1572.9"),
  };

  it("never round-trips the entered currency through a rate", () => {
    // The whole point of storing the trade as entered: the peso price comes
    // back byte-identical, not as price/rate*rate.
    for (const currency of ["ARS", "MEP", "CCL"] as const) {
      const replay = toReplayTransaction({ ...row, currency });
      const own = { ARS: replay.price.ars, MEP: replay.price.mep, CCL: replay.price.ccl }[currency];
      expect(own.toString()).toBe("1234.5678");
    }
  });

  it("refuses a row with no rate snapshot rather than guessing", () => {
    expect(() => toReplayTransaction({ ...row, mepRate: null })).toThrow(/missing its FX rate snapshot/);
    expect(() => toReplayTransaction({ ...row, cclRate: null })).toThrow(/missing its FX rate snapshot/);
  });

  it("rejects a currency outside the contract", () => {
    expect(() => toReplayTransaction({ ...row, currency: "USD" })).toThrow();
  });
});

describe("sellOverdrawsAt", () => {
  it("rejects a sell exceeding the position at its date", () => {
    const buy = tx("BUY", 10, 100);
    const sell = tx("SELL", 15, 100);
    expect(sellOverdrawsAt([buy, sell], sell.id, D(0))).toBe(true);
  });

  it("allows a sell covered by an imported base", () => {
    const sell = tx("SELL", 15, 100);
    expect(sellOverdrawsAt([sell], sell.id, D(20))).toBe(false);
  });

  it("rejects a backdated sell that predates the covering buy", () => {
    const sell = tx("SELL", 5, 100); // chronologically first
    const buy = tx("BUY", 10, 100);
    expect(sellOverdrawsAt([sell, buy], sell.id, D(0))).toBe(true);
  });

  it("ignores pre-existing dips from legacy data", () => {
    const legacyOversell = tx("SELL", 5, 100); // old clamped row
    const buy = tx("BUY", 10, 100);
    const candidate = tx("SELL", 10, 100);
    expect(sellOverdrawsAt([legacyOversell, buy, candidate], candidate.id, D(0))).toBe(false);
  });

  it("allows selling the exact held quantity", () => {
    const buy = tx("BUY", 10, 100);
    const sell = tx("SELL", 10, 100);
    expect(sellOverdrawsAt([buy, sell], sell.id, D(0))).toBe(false);
  });
});
