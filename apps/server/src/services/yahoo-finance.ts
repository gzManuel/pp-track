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
