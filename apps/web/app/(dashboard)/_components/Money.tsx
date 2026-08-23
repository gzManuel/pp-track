"use client";

import { MASK, useMoneyVisibility } from "@/lib/money-visibility";
import { formatMoney } from "@/lib/utils";

/**
 * A monetary amount, masked when the user has hidden prices.
 *
 * Rendering money through this component — rather than calling `formatMoney`
 * inline — is what lets the server-rendered pages mask: a client leaf inside a
 * server tree still reads the provider mounted above it in the layout.
 *
 * `signed` prefixes a `+` on non-negative values, for gain/loss cells. The sign
 * is dropped along with the digits when hidden.
 */
export default function Money({ value, decimals = 2, signed = false }: { value: number; decimals?: number; signed?: boolean }) {
  const { hidden } = useMoneyVisibility();
  if (hidden) return <>{MASK}</>;
  return (
    <>
      {signed && value >= 0 ? "+" : ""}
      {formatMoney(value, decimals)}
    </>
  );
}
