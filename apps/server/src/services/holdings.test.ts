import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { computeRebuild, replayPosition, sellOverdrawsAt, type ReplayTransaction } from "./holdings.js";

const D = (v: string | number) => new Prisma.Decimal(v);

let nextId = 0;
function tx(type: "BUY" | "SELL", quantity: string | number, price: string | number, fee: string | number = 0): ReplayTransaction {
  return { id: `t${String(++nextId)}`, type, quantity: D(quantity), price: D(price), fee: D(fee) };
}

describe("replayPosition", () => {
  it("accumulates buys with fees into total cost", () => {
    const pos = replayPosition([tx("BUY", 10, 100, 5), tx("BUY", 10, 110, 5)]);
    expect(pos.quantity.toString()).toBe("20");
    // 10*100+5 + 10*110+5 = 2110
    expect(pos.value.toString()).toBe("2110");
  });

  it("keeps the average unchanged on a sell", () => {
    const pos = replayPosition([tx("BUY", 10, 100), tx("BUY", 10, 200), tx("SELL", 5, 500)]);
    // avg before sell = 150; after selling 5 at the running average, value = 15*150
    expect(pos.quantity.toString()).toBe("15");
    expect(pos.value.toString()).toBe("2250");
    expect(pos.value.div(pos.quantity).toString()).toBe("150");
  });

  it("clamps an oversell to zero instead of going negative", () => {
    const pos = replayPosition([tx("BUY", 5, 100), tx("SELL", 10, 100)]);
    expect(pos.quantity.toString()).toBe("0");
    expect(pos.value.toString()).toBe("0");
  });

  it("is exact where binary floats are not (0.1 + 0.2 class)", () => {
    const pos = replayPosition([tx("BUY", "0.1", "3"), tx("BUY", "0.2", "3")]);
    expect(pos.quantity.toString()).toBe("0.3"); // not 0.30000000000000004
    expect(pos.value.toString()).toBe("0.9");
  });

  it("sell against an empty position leaves zero", () => {
    const pos = replayPosition([tx("SELL", 5, 100)]);
    expect(pos.quantity.toString()).toBe("0");
    expect(pos.value.toString()).toBe("0");
  });
});

describe("computeRebuild", () => {
  it("returns null (delete) when the last transaction of a transaction-built holding is removed", () => {
    const only = tx("BUY", 10, 100);
    const result = computeRebuild({
      holding: { quantity: D(10), avgCostBasis: D(100) },
      explained: [only], // holding is fully explained by this tx
      rebuilt: [], // ... which is being deleted
    });
    expect(result).toBeNull();
  });

  it("preserves an imported base when its unrelated transaction is removed", () => {
    const bought = tx("BUY", 5, 200);
    const result = computeRebuild({
      // 15 shares total: 10 imported at avg 100 blended with 5 bought at 200 -> avg 400/3
      holding: { quantity: D(15), avgCostBasis: D(2000).div(15) },
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
      holding: { quantity: D(5), avgCostBasis: D(100) },
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
      holding: { quantity: D("10.000000001"), avgCostBasis: D(100) },
      explained: [only],
      rebuilt: [],
    });
    expect(result).toBeNull();
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
