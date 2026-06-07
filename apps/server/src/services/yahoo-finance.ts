import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

export interface QuoteResult {
  symbol: string;
  price: number;
  currency: string;
  name: string;
  quoteType: string;
  exchange: string | null;
}

/**
 * CEDEARs are tracked in USD via their `D` variant on BYMA (`.BA`), e.g.
 * `SPYD.BA`. Stripping the `D` gives the ARS-priced ticker, `SPY.BA`.
 * Non-BYMA tickers (and tickers without a `D` suffix) are returned as-is.
 */
export function toArsTicker(ticker: string): string {
  if (!/D\.BA$/i.test(ticker)) return ticker;
  return ticker.replace(/D\.BA$/i, ".BA");
}

/**
 * Inverse of `toArsTicker`: the USD `D` variant of a peso CEDEAR ticker,
 * `SPY.BA` -> `SPYD.BA`. Non-BYMA tickers (and existing `D` variants) pass through.
 */
export function toUsdTicker(ticker: string): string {
  if (!/\.BA$/i.test(ticker) || /D\.BA$/i.test(ticker)) return ticker;
  return ticker.replace(/\.BA$/i, "D.BA");
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
  const result = (await yf.search(query, { newsCount: 0 }, { validateResult: false })) as {
    quotes?: Array<Record<string, unknown>>;
  };

  return (result.quotes ?? [])
    .filter(
      (q) =>
        q.isYahooFinance === true &&
        typeof q.quoteType === "string" &&
        SEARCHABLE_TYPES.has(q.quoteType)
    )
    .map((q) => ({
      symbol: String(q.symbol),
      name: String(q.longname ?? q.shortname ?? q.symbol),
      exchange: q.exchange != null ? String(q.exchange) : null,
      type: String(q.quoteType),
    }));
}

export async function fetchQuote(symbol: string): Promise<QuoteResult> {
  const quote = await yf.quote(symbol);

  if (!quote) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  if (quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) {
    throw new Error(`No price available for ${symbol}`);
  }

  return {
    symbol: quote.symbol,
    price: quote.regularMarketPrice,
    currency: quote.currency ?? "USD",
    name: quote.longName ?? quote.shortName ?? symbol,
    quoteType: quote.quoteType ?? "EQUITY",
    exchange: quote.exchange ?? null,
  };
}
