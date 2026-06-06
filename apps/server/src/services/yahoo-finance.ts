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

/** Most recent daily close on or before `at`, or null if none is available. */
async function closeOnOrBefore(symbol: string, at: Date): Promise<number | null> {
  const period1 = new Date(at.getTime() - 7 * 24 * 60 * 60 * 1000);
  const period2 = new Date(at.getTime() + 24 * 60 * 60 * 1000);
  try {
    const chart = await yf.chart(symbol, { period1, period2, interval: "1d" });
    const usable = chart.quotes.filter(
      (q) => q.close != null && q.date != null && q.date.getTime() <= period2.getTime()
    );
    return usable.at(-1)?.close ?? null;
  } catch {
    return null;
  }
}

/**
 * Dólar MEP implied by a CEDEAR pair at a given date: the ARS price of the
 * `.BA` ticker divided by the USD price of its `D` variant (ARS per USD).
 * Falls back to the current implied rate when no historical bar exists yet
 * (e.g. same-day logging).
 */
export async function getMepRate(arsTicker: string, at: Date): Promise<number> {
  const usdTicker = toUsdTicker(arsTicker);

  const [arsClose, usdClose] = await Promise.all([
    closeOnOrBefore(arsTicker, at),
    closeOnOrBefore(usdTicker, at),
  ]);
  if (arsClose && usdClose) return arsClose / usdClose;

  const [ars, usd] = await Promise.all([fetchQuote(arsTicker), fetchQuote(usdTicker)]);
  return ars.price / usd.price;
}
