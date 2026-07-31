import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

// A hung Yahoo request must never hang a request handler (a /prices call fans
// out into up to 50 of these).
const FETCH_TIMEOUT_MS = 5000;
const fetchTimeout = () => ({ fetchOptions: { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) } });

export interface QuoteResult {
  symbol: string;
  price: number;
  currency: string;
  name: string;
  quoteType: string;
  exchange: string | null;
}

/**
 * The ARS-priced BYMA ticker, which is the canonical identity for a CEDEAR.
 *
 * A CEDEAR trades under three symbols on BYMA (`.BA`): the bare peso ticker
 * (`SPY.BA`), the `D` variant settling in MEP dollars (`SPYD.BA`), and the `C`
 * variant settling in cable dollars (`SPYC.BA`). All three are quote symbols for
 * one instrument, so both suffixes are stripped to converge on a single Asset.
 * Non-BYMA tickers, and BYMA tickers with neither suffix, are returned as-is.
 *
 * ⚠️ This is a *syntactic* strip and is therefore ambiguous: a base symbol that
 * itself ends in D or C is indistinguishable from a variant suffix. `GLD.BA`
 * (the peso CEDEAR for gold) reduces to a bogus `GL.BA`, and `GLDD.BA` is its
 * real MEP variant. Do not use this to decide an asset's identity — call
 * `resolveCanonicalTicker` in services/assets.ts, which disambiguates against
 * the assets already registered and, failing that, against the upstream quote.
 * It is safe for the inverse direction and for picking a symbol to quote.
 */
export function toArsTicker(ticker: string): string {
  return ticker.replace(/[DC]\.BA$/i, ".BA");
}

/** True when stripping a D/C suffix off `ticker` would change it. */
export function hasVariantSuffix(ticker: string): boolean {
  return /[DC]\.BA$/i.test(ticker);
}

/**
 * The MEP-dollar `D` variant of a peso CEDEAR ticker, `SPY.BA` -> `SPYD.BA`.
 * Non-BYMA tickers pass through; a `C` variant is rewritten to `D`, since this
 * exists to pick the symbol to request a USD quote for.
 */
export function toUsdTicker(ticker: string): string {
  const ars = toArsTicker(ticker);
  if (!/\.BA$/i.test(ars)) return ticker;
  return ars.replace(/\.BA$/i, "D.BA");
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string;
}

/**
 * Free-text symbol search backing the ticker autocomplete. Returns Yahoo-listed
 * equities, ETFs and cryptocurrencies (stocks, CEDEARs and crypto are tracked);
 * futures, indices, currencies and non-Yahoo entities are dropped.
 */
const SEARCHABLE_TYPES = new Set(["EQUITY", "ETF", "CRYPTOCURRENCY"]);

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  // `validateResult: false` skips yahoo-finance2's bundled JSON-schema check,
  // which rejects otherwise-valid ETF/equity quotes when Yahoo's response shape
  // drifts ahead of the installed library version.
  const result = (await yf.search(query, { newsCount: 0 }, { validateResult: false, ...fetchTimeout() })) as {
    quotes?: Record<string, unknown>[];
  };

  return (result.quotes ?? [])
    .filter((q) => q.isYahooFinance === true && typeof q.quoteType === "string" && SEARCHABLE_TYPES.has(q.quoteType))
    .map((q) => ({
      symbol: String(q.symbol),
      name: String(q.longname ?? q.shortname ?? q.symbol),
      exchange: typeof q.exchange === "string" ? q.exchange : null,
      type: String(q.quoteType),
    }));
}

export async function fetchQuote(symbol: string): Promise<QuoteResult> {
  // yahoo-finance2's Quote type is a loose union whose fields resolve to `any`;
  // pin the shape we consume at this boundary so callers get real types.
  const quote = (await yf.quote(symbol, undefined, fetchTimeout())) as unknown as
    | {
        symbol?: string;
        regularMarketPrice?: number | null;
        currency?: string;
        longName?: string;
        shortName?: string;
        quoteType?: string;
        exchange?: string;
      }
    | undefined;

  if (!quote) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  if (quote.regularMarketPrice == null) {
    throw new Error(`No price available for ${symbol}`);
  }

  return {
    symbol: quote.symbol ?? symbol,
    price: quote.regularMarketPrice,
    currency: quote.currency ?? "USD",
    name: quote.longName ?? quote.shortName ?? symbol,
    quoteType: quote.quoteType ?? "EQUITY",
    exchange: quote.exchange ?? null,
  };
}
