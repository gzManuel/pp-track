import { Prisma } from "@prisma/client";
import type { Currency } from "@repo/api-contract";

/**
 * One amount expressed in all three tracked currencies.
 *
 * Nothing is converted when a transaction is written — the trade is stored in
 * the currency it was entered in, alongside the MEP and CCL rates that were in
 * effect on its date. This module is the single place those three views are
 * derived, so the arithmetic exists once rather than at every read site.
 */
export interface Money {
  ars: Prisma.Decimal;
  mep: Prisma.Decimal;
  ccl: Prisma.Decimal;
}

/** ARS per USD, on the date of the trade being converted. */
export interface Rates {
  mepRate: Prisma.Decimal;
  cclRate: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);

export const ZERO_MONEY: Money = { ars: ZERO, mep: ZERO, ccl: ZERO };

export function addMoney(a: Money, b: Money): Money {
  return { ars: a.ars.plus(b.ars), mep: a.mep.plus(b.mep), ccl: a.ccl.plus(b.ccl) };
}

export function scaleMoney(m: Money, factor: Prisma.Decimal): Money {
  return { ars: m.ars.times(factor), mep: m.mep.times(factor), ccl: m.ccl.times(factor) };
}

/** Per-currency map, for the handful of places that need to treat the three uniformly. */
export function mapMoney(m: Money, fn: (value: Prisma.Decimal) => Prisma.Decimal): Money {
  return { ars: fn(m.ars), mep: fn(m.mep), ccl: fn(m.ccl) };
}

/**
 * Express `amount` (denominated in `currency`) in all three currencies, using
 * the rates that applied on the trade's date.
 *
 * The identity case is deliberate and load-bearing: the currency the trade was
 * entered in is copied through untouched, never round-tripped through a rate.
 * A trade always reports back the exact amount that was typed in.
 */
export function toMoney(amount: Prisma.Decimal, currency: Currency, rates: Rates): Money {
  const { mepRate, cclRate } = rates;

  // Rates come from an upstream that only ever publishes positive values; a
  // zero here means corrupt data, and dividing by it would silently poison a
  // cost basis. Fail loudly instead.
  if (mepRate.lte(0) || cclRate.lte(0)) {
    throw new Error(`Invalid FX rates for conversion: mep=${mepRate.toString()} ccl=${cclRate.toString()}`);
  }

  switch (currency) {
    case "ARS":
      return { ars: amount, mep: amount.div(mepRate), ccl: amount.div(cclRate) };
    case "MEP":
      return { ars: amount.times(mepRate), mep: amount, ccl: amount.times(mepRate).div(cclRate) };
    case "CCL":
      return { ars: amount.times(cclRate), mep: amount.times(cclRate).div(mepRate), ccl: amount };
  }
}

/** Pull a single currency out of a `Money`. */
export function inCurrency(m: Money, currency: Currency): Prisma.Decimal {
  switch (currency) {
    case "ARS":
      return m.ars;
    case "MEP":
      return m.mep;
    case "CCL":
      return m.ccl;
  }
}
