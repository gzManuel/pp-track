import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchQuote, resolveUsdVariant, searchSymbols } from "./yahoo-finance.js";

/**
 * Covers the parts of `yahoo-finance.js` that talk to the library itself —
 * the response-shape guards in `fetchQuote`, the symbol-search fallback in
 * `resolveUsdVariant`, and the filtering in `searchSymbols`.
 *
 * The sibling `yahoo-finance.test.ts` covers the pure ticker helpers against the
 * real module; the library mock lives here so it can't leak into those.
 */
const quote = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn());

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = quote;
    search = search;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchQuote", () => {
  it("should map an upstream quote onto the pinned shape", async () => {
    quote.mockResolvedValue({
      symbol: "AAPL",
      regularMarketPrice: 231.5,
      currency: "USD",
      longName: "Apple Inc.",
      shortName: "Apple",
      quoteType: "EQUITY",
      exchange: "NMS",
    });

    expect(await fetchQuote("AAPL")).toEqual({
      symbol: "AAPL",
      price: 231.5,
      currency: "USD",
      name: "Apple Inc.",
      quoteType: "EQUITY",
      exchange: "NMS",
    });
  });

  it("should throw when the symbol does not resolve", async () => {
    quote.mockResolvedValue(undefined);

    await expect(fetchQuote("NOPE.BA")).rejects.toThrow("Symbol not found: NOPE.BA");
  });

  // A quote row with no price is useless to every caller, and `null` here would
  // otherwise flow into the Asset seed and the price snapshot.
  it("should throw when the quote carries no price", async () => {
    quote.mockResolvedValue({ symbol: "GL.BA", regularMarketPrice: null, currency: "ARS" });

    await expect(fetchQuote("GL.BA")).rejects.toThrow("No price available for GL.BA");
  });

  it("should fall back to the short name when the long name is absent", async () => {
    quote.mockResolvedValue({ symbol: "SPY.BA", regularMarketPrice: 1, shortName: "SPY CEDEAR" });

    expect(await fetchQuote("SPY.BA")).toMatchObject({ name: "SPY CEDEAR" });
  });

  // Yahoo's response shape drifts, so every optional field needs a defined default.
  it("should default the requested symbol, currency, name, type and exchange when the quote omits them", async () => {
    quote.mockResolvedValue({ regularMarketPrice: 42 });

    expect(await fetchQuote("MYSTERY")).toEqual({
      symbol: "MYSTERY",
      price: 42,
      currency: "USD",
      name: "MYSTERY",
      quoteType: "EQUITY",
      exchange: null,
    });
  });
});

describe("resolveUsdVariant", () => {
  const usdQuote = { symbol: "SPYD.BA", regularMarketPrice: 6.5, currency: "USD", shortName: "SPY CEDEAR", exchange: "BUE" };

  it("should take the regex-derived symbol when it quotes in dollars, without searching", async () => {
    quote.mockResolvedValue(usdQuote);

    expect(await resolveUsdVariant("SPY CEDEAR", "SPYD.BA")).toBe("SPYD.BA");
    expect(search).not.toHaveBeenCalled();
  });

  // GOOGL.BA -> the regex yields GOOGLD.BA, which doesn't exist; the real MEP
  // variant is GOGLD.BA and only the name search surfaces it.
  it("should search by asset name when the regex-derived symbol does not resolve", async () => {
    quote.mockRejectedValue(new Error("Symbol not found: GOOGLD.BA"));
    search.mockResolvedValue({
      quotes: [{ symbol: "GOGLD.BA", exchange: "BUE", shortname: "ALPHABET INC CEDEAR" }],
    });

    expect(await resolveUsdVariant("Alphabet Inc", "GOOGLD.BA")).toBe("GOGLD.BA");
    expect(search).toHaveBeenCalledWith("Alphabet Inc CEDEAR", { newsCount: 0 }, expect.objectContaining({ validateResult: false }));
  });

  // A resolving symbol that quotes in pesos is the wrong variant, not the answer.
  it("should fall through to the search when the regex-derived symbol quotes in pesos", async () => {
    quote.mockResolvedValue({ symbol: "SPYD.BA", regularMarketPrice: 1900, currency: "ARS" });
    search.mockResolvedValue({ quotes: [{ symbol: "SPYD.BA", exchange: "BUE", shortname: "SPY CEDEAR" }] });

    expect(await resolveUsdVariant("SPY", "SPYD.BA")).toBe("SPYD.BA");
    expect(search).toHaveBeenCalled();
  });

  it.each([
    ["the symbol is not a D variant", { symbol: "SPY.BA", exchange: "BUE", shortname: "SPY CEDEAR" }],
    ["the listing is not on BYMA", { symbol: "SPYD.BA", exchange: "NMS", shortname: "SPY CEDEAR" }],
    ["the name is not a CEDEAR", { symbol: "SPYD.BA", exchange: "BUE", shortname: "SPY ETF TRUST" }],
  ])("should throw when %s", async (_case, candidate) => {
    quote.mockRejectedValue(new Error("Symbol not found"));
    search.mockResolvedValue({ quotes: [candidate] });

    await expect(resolveUsdVariant("SPY", "SPYD.BA")).rejects.toThrow('No MEP variant found for asset "SPY"');
  });

  it("should throw when the search comes back with no quotes at all", async () => {
    quote.mockRejectedValue(new Error("Symbol not found"));
    search.mockResolvedValue({});

    await expect(resolveUsdVariant("Nonesuch", "NOPED.BA")).rejects.toThrow('tried regex "NOPED.BA" and symbol search');
  });
});

describe("searchSymbols", () => {
  it("should return only Yahoo-listed equities, ETFs and cryptocurrencies", async () => {
    search.mockResolvedValue({
      quotes: [
        { isYahooFinance: true, quoteType: "EQUITY", symbol: "AAPL", longname: "Apple Inc.", exchange: "NMS" },
        { isYahooFinance: true, quoteType: "ETF", symbol: "SPY", longname: "SPDR S&P 500", exchange: "PCX" },
        { isYahooFinance: true, quoteType: "CRYPTOCURRENCY", symbol: "BTC-USD", longname: "Bitcoin USD", exchange: "CCC" },
        { isYahooFinance: true, quoteType: "FUTURE", symbol: "ES=F", longname: "E-Mini", exchange: "CME" },
        { isYahooFinance: true, quoteType: "INDEX", symbol: "^GSPC", longname: "S&P 500", exchange: "SNP" },
        { isYahooFinance: false, quoteType: "EQUITY", symbol: "PRIVATECO", longname: "Not on Yahoo", exchange: "XXX" },
        { isYahooFinance: true, symbol: "NOTYPE", longname: "Missing quoteType", exchange: "NMS" },
      ],
    });

    expect((await searchSymbols("app")).map((r) => r.symbol)).toEqual(["AAPL", "SPY", "BTC-USD"]);
  });

  it("should fall back from longname to shortname to the symbol itself", async () => {
    search.mockResolvedValue({
      quotes: [
        { isYahooFinance: true, quoteType: "EQUITY", symbol: "A", shortname: "A Short", exchange: "NMS" },
        { isYahooFinance: true, quoteType: "EQUITY", symbol: "B", exchange: "NMS" },
      ],
    });

    expect((await searchSymbols("x")).map((r) => r.name)).toEqual(["A Short", "B"]);
  });

  it("should null a non-string exchange rather than stringifying it", async () => {
    search.mockResolvedValue({ quotes: [{ isYahooFinance: true, quoteType: "EQUITY", symbol: "A", longname: "A", exchange: 42 }] });

    expect((await searchSymbols("a"))[0]?.exchange).toBeNull();
  });

  it("should return an empty list when the search carries no quotes", async () => {
    search.mockResolvedValue({});

    expect(await searchSymbols("zzz")).toEqual([]);
  });
});
