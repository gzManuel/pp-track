import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCanonicalTicker, type AssetClient } from "./assets.js";
import { toArsTicker, toUsdTicker } from "./yahoo-finance.js";

const fetchQuote = vi.hoisted(() => vi.fn());
vi.mock("./yahoo-finance.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./yahoo-finance.js")>()),
  fetchQuote,
}));

/** Minimal asset client backed by a list of registered tickers. */
function clientWith(tickers: string[]): AssetClient {
  return {
    asset: {
      findFirst: vi.fn(({ where }: { where: { ticker: string } }) =>
        Promise.resolve(tickers.includes(where.ticker) ? { id: `id-${where.ticker}`, ticker: where.ticker } : null),
      ),
    },
  } as unknown as AssetClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toArsTicker / toUsdTicker", () => {
  it.each([
    ["SPY.BA", "SPY.BA"],
    ["SPYD.BA", "SPY.BA"],
    ["SPYC.BA", "SPY.BA"],
    ["AAPL", "AAPL"],
  ])("should convert toArsTicker(%s) to %s", (input, expected) => {
    expect(toArsTicker(input)).toBe(expected);
  });

  it.each([
    ["SPY.BA", "SPYD.BA"],
    ["SPYC.BA", "SPYD.BA"],
    ["SPYD.BA", "SPYD.BA"],
    ["AAPL", "AAPL"],
  ])("should convert toUsdTicker(%s) to %s", (input, expected) => {
    expect(toUsdTicker(input)).toBe(expected);
  });
});

describe("resolveCanonicalTicker", () => {
  it("should leave a ticker with no variant suffix alone without any lookup", async () => {
    const client = clientWith([]);
    expect(await resolveCanonicalTicker(client, "AAPL")).toBe("AAPL");
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("should join a D-variant onto the peso asset already registered", async () => {
    const client = clientWith(["SPY.BA"]);
    expect(await resolveCanonicalTicker(client, "SPYD.BA")).toBe("SPY.BA");
    expect(fetchQuote).not.toHaveBeenCalled(); // resolved from the DB alone
  });

  it("should join a C-variant onto the same peso asset", async () => {
    const client = clientWith(["SPY.BA"]);
    expect(await resolveCanonicalTicker(client, "SPYC.BA")).toBe("SPY.BA");
  });

  it("should adopt the peso form on first sight when it really is a peso BYMA symbol", async () => {
    fetchQuote.mockResolvedValue({ symbol: "SPY.BA", currency: "ARS", price: 1, name: "SPDR", quoteType: "ETF", exchange: "BUE" });
    expect(await resolveCanonicalTicker(clientWith([]), "SPYD.BA")).toBe("SPY.BA");
  });

  // The GLD case: a base symbol that itself ends in D. Stripping it yields the
  // bogus GL.BA, which would split the gold CEDEAR across two asset rows.
  it("should keep GLD.BA intact when it is the registered asset", async () => {
    const client = clientWith(["GLD.BA"]);
    expect(await resolveCanonicalTicker(client, "GLD.BA")).toBe("GLD.BA");
  });

  it("should keep GLD.BA intact on first sight, since GL.BA is not a real symbol", async () => {
    fetchQuote.mockRejectedValue(new Error("Symbol not found: GL.BA"));
    expect(await resolveCanonicalTicker(clientWith([]), "GLD.BA")).toBe("GLD.BA");
  });

  it("should still merge GLDD.BA into GLD.BA", async () => {
    const client = clientWith(["GLD.BA"]);
    expect(await resolveCanonicalTicker(client, "GLDD.BA")).toBe("GLD.BA");
  });

  it("should not adopt a stripped form that is quoted in dollars", async () => {
    // A dollar quote means the stripped symbol is not the peso ticker.
    fetchQuote.mockResolvedValue({ symbol: "GL.BA", currency: "USD", price: 1, name: "?", quoteType: "EQUITY", exchange: "BUE" });
    expect(await resolveCanonicalTicker(clientWith([]), "GLD.BA")).toBe("GLD.BA");
  });

  it("should keep the entered ticker when upstream is unreachable", async () => {
    fetchQuote.mockRejectedValue(new Error("network down"));
    expect(await resolveCanonicalTicker(clientWith([]), "SPYD.BA")).toBe("SPYD.BA");
  });
});
