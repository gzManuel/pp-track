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
