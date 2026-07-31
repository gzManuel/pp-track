import { describe, expect, it } from "vitest";
import { parsePortfolioSelection } from "./portfolio-selection";
import type { Portfolio } from "./types";

// Only id/isDefault matter here; the rest satisfies the API shape.
function portfolio(id: string, name: string, isDefault: boolean): Portfolio {
  return {
    id,
    userId: "00000000-0000-4000-8000-000000000001",
    name,
    description: null,
    currency: "USD",
    isDefault,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const A = portfolio("a", "Alpha", false);
const B = portfolio("b", "Beta", true);
const C = portfolio("c", "Gamma", false);
const ALL = [A, B, C];

describe("parsePortfolioSelection", () => {
  it("absent param selects every portfolio", () => {
    const s = parsePortfolioSelection(undefined, ALL);
    expect(s.selectedIds).toEqual(["a", "b", "c"]);
    expect(s.allSelected).toBe(true);
  });

  // The default portfolio decides what a new transaction is pre-assigned to,
  // not what the dashboard lands on.
  it("absent param ignores which portfolio is the default", () => {
    const noDefault = [A, portfolio("b", "Beta", false), C];
    const s = parsePortfolioSelection(undefined, noDefault);
    expect(s.selectedIds).toEqual(["a", "b", "c"]);
    expect(s.allSelected).toBe(true);
  });

  it("an absent param and 'all' are equivalent", () => {
    expect(parsePortfolioSelection(undefined, ALL)).toEqual(parsePortfolioSelection("all", ALL));
  });

  it("an empty param behaves as absent", () => {
    expect(parsePortfolioSelection("", ALL)).toEqual(parsePortfolioSelection(undefined, ALL));
  });

  it("'all' selects everything", () => {
    const s = parsePortfolioSelection("all", ALL);
    expect(s.selectedIds).toEqual(["a", "b", "c"]);
    expect(s.allSelected).toBe(true);
  });

  it("'none' is an explicit empty selection", () => {
    const s = parsePortfolioSelection("none", ALL);
    expect(s.selected).toEqual([]);
    expect(s.allSelected).toBe(false);
  });

  it("a comma list selects the subset in portfolio order", () => {
    const s = parsePortfolioSelection("c,a", ALL);
    expect(s.selectedIds).toEqual(["a", "c"]);
    expect(s.allSelected).toBe(false);
  });

  // allSelected is derived from the resolved selection, so a hand-typed URL
  // naming every id reports the same state as "all".
  it("a comma list naming every portfolio counts as all selected", () => {
    const s = parsePortfolioSelection("c,a,b", ALL);
    expect(s.allSelected).toBe(true);
  });

  it("stale ids are dropped silently", () => {
    const s = parsePortfolioSelection("a,deleted-id", ALL);
    expect(s.selectedIds).toEqual(["a"]);
  });

  it("a list of only stale ids yields an empty selection, not the default", () => {
    const s = parsePortfolioSelection("deleted-id", ALL);
    expect(s.selected).toEqual([]);
  });

  it("empty portfolio list yields an empty selection", () => {
    const s = parsePortfolioSelection(undefined, []);
    expect(s.selected).toEqual([]);
  });
});
