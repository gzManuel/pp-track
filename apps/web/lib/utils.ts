import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Standard money formatting used across tables, cards, and chart tooltips. */
export function formatMoney(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Shares: whole numbers for stocks/ETFs, but crypto positions are fractional
// (e.g. 0.05 BTC), so show up to 8 decimals and trim trailing zeros.
export function formatShares(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}
