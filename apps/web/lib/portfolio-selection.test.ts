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
  it("should select every portfolio when absent param", () => {
    const s = parsePortfolioSelection(undefined, ALL);
    expect(s.selectedIds).toEqual(["a", "b", "c"]);
    expect(s.allSelected).toBe(true);
  });

  // The default portfolio decides what a new transaction is pre-assigned to,
  // not what the dashboard lands on.
  it("should ignore which portfolio is the default when absent param", () => {
    const noDefault = [A, portfolio("b", "Beta", false), C];
    const s = parsePortfolioSelection(undefined, noDefault);
    expect(s.selectedIds).toEqual(["a", "b", "c"]);
    expect(s.allSelected).toBe(true);
  });

  it("should treat absent param and 'all' as equivalent", () => {
    expect(parsePortfolioSelection(undefined, ALL)).toEqual(parsePortfolioSelection("all", ALL));
  });

  it("should behave as absent when an empty param", () => {
    expect(parsePortfolioSelection("", ALL)).toEqual(parsePortfolioSelection(undefined, ALL));
  });

  it("should select everything with 'all'", () => {
    const s = parsePortfolioSelection("all", ALL);
    expect(s.selectedIds).toEqual(["a", "b", "c"]);
    expect(s.allSelected).toBe(true);
  });

  it("should be an explicit empty selection with 'none'", () => {
    const s = parsePortfolioSelection("none", ALL);
    expect(s.selected).toEqual([]);
    expect(s.allSelected).toBe(false);
  });

  it("should select the subset in portfolio order from a comma list", () => {
    const s = parsePortfolioSelection("c,a", ALL);
    expect(s.selectedIds).toEqual(["a", "c"]);
    expect(s.allSelected).toBe(false);
  });

  // allSelected is derived from the resolved selection, so a hand-typed URL
  // naming every id reports the same state as "all".
  it("should count as all selected when a comma list names every portfolio", () => {
    const s = parsePortfolioSelection("c,a,b", ALL);
    expect(s.allSelected).toBe(true);
  });

  it("should drop stale ids silently", () => {
    const s = parsePortfolioSelection("a,deleted-id", ALL);
    expect(s.selectedIds).toEqual(["a"]);
  });

  it("should yield an empty selection from a list of only stale ids, not the default", () => {
    const s = parsePortfolioSelection("deleted-id", ALL);
    expect(s.selected).toEqual([]);
  });

  it("should yield an empty selection when empty portfolio list", () => {
    const s = parsePortfolioSelection(undefined, []);
    expect(s.selected).toEqual([]);
  });
});
