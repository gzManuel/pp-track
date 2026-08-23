"use client";

import { MASK, useMoneyVisibility } from "@/lib/money-visibility";
import { formatShares } from "@/lib/utils";

/**
 * A position's share count, masked by the same toggle that hides money.
 *
 * A share count is not an amount, but combined with a public share price it
 * discloses the position's value just as directly — so it hides alongside it.
 */
export default function Shares({ value }: { value: number }) {
  const { hidden } = useMoneyVisibility();
  if (hidden) return <>{MASK}</>;
  return <>{formatShares(value)}</>;
}
