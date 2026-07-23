import type { Portfolio } from "./types";

export interface PortfolioSelection {
  selected: Portfolio[];
  selectedIds: string[];
  allSelected: boolean;
}

/**
 * Resolve the `?portfolio=` search param into a portfolio selection — the one
 * interpretation shared by every page: absent → the default (or first)
 * portfolio, "all" → everything, "none" → explicit empty selection, and a
 * comma list → that subset.
 */
export function parsePortfolioSelection(param: string | undefined, portfolios: Portfolio[]): PortfolioSelection {
  const showAll = param === "all";
  const explicitNone = param === "none";
  const ids = param && !showAll && !explicitNone ? param.split(",").filter(Boolean) : [];
  const defaultPortfolio = portfolios.find((p) => p.isDefault) ?? portfolios[0];

  let selected: Portfolio[];
  if (showAll) {
    selected = portfolios;
  } else if (ids.length > 0) {
    selected = portfolios.filter((p) => ids.includes(p.id));
  } else if (explicitNone || !defaultPortfolio) {
    selected = [];
  } else {
    selected = [defaultPortfolio];
  }

  return {
    selected,
    selectedIds: selected.map((p) => p.id),
    allSelected: showAll || (!explicitNone && ids.length === 0),
  };
}
