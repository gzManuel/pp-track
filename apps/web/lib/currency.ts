import { currencySchema, type Currency } from "@repo/api-contract";
import type { RawHolding, Transaction } from "./types";

/**
 * Display-currency helpers shared by the dashboard pages.
 *
 * The `?currency=` search param drives which of the three views is shown. MEP is
 * the default because it is what the app showed as "USD" before CCL existed, so
 * an existing bookmark keeps its meaning.
 */

export const DEFAULT_CURRENCY: Currency = "MEP";

/** Read a display currency off a URL param, falling back to the default. */
export function parseDisplayCurrency(raw: string | null | undefined): Currency {
  const parsed = currencySchema.safeParse(raw?.toUpperCase());
  return parsed.success ? parsed.data : DEFAULT_CURRENCY;
}

/**
 * The currency a stored transaction was entered in, for pre-filling the edit
 * form. Same fallback as the display parser, so a legacy row that somehow
 * escaped the migration lands on MEP rather than crashing the form.
 */
export function parseEntryCurrency(raw: string): Currency {
  return parseDisplayCurrency(raw);
}

/** Symbol shown next to an amount. MEP and CCL are both dollars. */
export function currencySymbol(currency: Currency): string {
  return currency === "ARS" ? "$" : "US$";
}

/**
 * The cost basis column matching a view. All three are stored per holding — the
 * amount actually paid in that currency — so this is a pick, not a conversion.
 */
export function costBasisFor(holding: RawHolding, currency: Currency): number {
  switch (currency) {
    case "ARS":
      return Number(holding.avgCostBasisArs);
    case "CCL":
      return Number(holding.avgCostBasisCcl);
    case "MEP":
      return Number(holding.avgCostBasis);
  }
}

/**
 * A transaction's price in the requested view, derived from the amount as
 * entered plus the rates snapshotted on its date.
 *
 * The entered currency is returned untouched — never round-tripped through a
 * rate — so a trade always displays the exact price that was typed in. Returns
 * null when a legacy row has no rate snapshot and the view needs one.
 */
export function transactionPriceIn(tx: Pick<Transaction, "price" | "currency" | "mepRate" | "cclRate">, currency: Currency): number | null {
  const price = Number(tx.price);
  if (tx.currency === currency) return price;

  const mep = tx.mepRate === null ? null : Number(tx.mepRate);
  const ccl = tx.cclRate === null ? null : Number(tx.cclRate);
  if (mep === null || ccl === null || mep <= 0 || ccl <= 0) return null;

  // Reach pesos first, then divide into the target dollar if needed. Mirrors
  // toMoney() on the server.
  const ars = tx.currency === "ARS" ? price : price * (tx.currency === "CCL" ? ccl : mep);
  if (currency === "ARS") return ars;
  return ars / (currency === "CCL" ? ccl : mep);
}

/**
 * How a ticker is shown in tables and charts.
 *
 * A CEDEAR is stored under its peso BYMA symbol (`SPY.BA`) — the canonical
 * identity for the instrument — but the suffix is noise to read past on every
 * row, so it is dropped for display. `isCedear` distinguishes it from a plain
 * US listing of the same name, which callers can badge.
 */
export function displayTicker(ticker: string): { label: string; isCedear: boolean } {
  const isCedear = /\.BA$/i.test(ticker);
  return { label: isCedear ? ticker.replace(/\.BA$/i, "") : ticker, isCedear };
}
