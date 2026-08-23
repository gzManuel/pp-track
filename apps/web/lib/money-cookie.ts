/**
 * Cookie encoding for the hide-prices toggle.
 *
 * Deliberately has no `"use client"` directive: the dashboard layout reads this
 * cookie during the *server* render (so hidden amounts are masked in the first
 * HTML byte), while the client provider writes it. A module marked
 * `"use client"` turns all of its exports into client references that the
 * server cannot call, so this encoding has to live on its own.
 */

export const HIDE_MONEY_COOKIE = "pp-track-hide-money";

export const HIDE_MONEY_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseHideMoney(raw: string | undefined): boolean {
  return raw === "1";
}
