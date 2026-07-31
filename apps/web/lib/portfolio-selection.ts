import type { Portfolio } from "./types";

export interface PortfolioSelection {
  selected: Portfolio[];
  selectedIds: string[];
  allSelected: boolean;
}

/**
 * Resolve the `?portfolio=` search param into a portfolio selection — the one
 * interpretation shared by every page: absent (or empty) → everything, same as
 * "all", "none" → explicit empty selection, and a comma list → that subset.
 *
 * `isDefault` deliberately plays no part here: it decides which portfolio a new
 * transaction is pre-assigned to, not what you land on.
 */
export function parsePortfolioSelection(param: string | undefined, portfolios: Portfolio[]): PortfolioSelection {
  const showAll = !param || param === "all";
  const explicitNone = param === "none";
  const ids = showAll || explicitNone ? [] : param.split(",").filter(Boolean);

  let selected: Portfolio[];
  if (showAll) {
    selected = portfolios;
  } else if (ids.length > 0) {
    selected = portfolios.filter((p) => ids.includes(p.id));
  } else {
    selected = [];
  }

  return {
    selected,
    selectedIds: selected.map((p) => p.id),
    // Derived from the resolved selection rather than re-read from the param,
    // so the switcher can never claim a state the page isn't rendering.
    allSelected: portfolios.length > 0 && selected.length === portfolios.length,
  };
}
