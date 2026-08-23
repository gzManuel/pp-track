"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { HIDE_MONEY_COOKIE, HIDE_MONEY_MAX_AGE_SECONDS } from "@/lib/money-cookie";
import { formatMoney } from "@/lib/utils";

/**
 * Global "hide my balances" state.
 *
 * The choice is persisted in a cookie rather than localStorage because every
 * page under `(dashboard)` is a server component: the layout reads the cookie
 * during the server render, so the first HTML byte already contains the mask.
 * localStorage would paint the real amounts and only blank them once the
 * client hydrated — a flash of exactly the numbers this feature exists to hide.
 */

/** What a hidden amount renders as. Fixed-width, so it leaks no magnitude. */
export const MASK = "•••••";

interface MoneyVisibility {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

const MoneyVisibilityContext = createContext<MoneyVisibility | null>(null);

export function MoneyVisibilityProvider({ initialHidden, children }: { initialHidden: boolean; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(initialHidden);

  // Persist for the next page load. The render itself is driven by state, so
  // toggling stays instant and never waits on a round trip.
  useEffect(() => {
    document.cookie = `${HIDE_MONEY_COOKIE}=${hidden ? "1" : "0"}; path=/; max-age=${String(HIDE_MONEY_MAX_AGE_SECONDS)}; SameSite=Lax`;
  }, [hidden]);

  const value = useMemo(() => ({ hidden, setHidden }), [hidden]);

  return <MoneyVisibilityContext.Provider value={value}>{children}</MoneyVisibilityContext.Provider>;
}

/**
 * Throws rather than defaulting to visible: a missing provider must fail loudly
 * instead of silently revealing every amount on the page.
 */
export function useMoneyVisibility(): MoneyVisibility {
  const context = useContext(MoneyVisibilityContext);
  if (!context) throw new Error("useMoneyVisibility must be used within a MoneyVisibilityProvider");
  return context;
}

/**
 * String-returning formatter, for the places that cannot render JSX — Recharts
 * tooltip and axis formatters. Elsewhere prefer `<Money />`.
 */
export function useMoneyFormat(): (value: number, decimals?: number) => string {
  const { hidden } = useMoneyVisibility();
  return useCallback((value: number, decimals = 2) => (hidden ? MASK : formatMoney(value, decimals)), [hidden]);
}
