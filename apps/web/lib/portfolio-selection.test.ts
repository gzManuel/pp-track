import { describe, expect, it } from "vitest";
import { parsePortfolioSelection } from "./portfolio-selection";
import type { Portfolio } from "./types";

const A: Portfolio = { id: "a", name: "Alpha", isDefault: false, currency: "USD" };
const B: Portfolio = { id: "b", name: "Beta", isDefault: true, currency: "USD" };
const C: Portfolio = { id: "c", name: "Gamma", isDefault: false, currency: "USD" };
const ALL = [A, B, C];

describe("parsePortfolioSelection", () => {
  it("absent param selects the default portfolio", () => {
    const s = parsePortfolioSelection(undefined, ALL);
    expect(s.selectedIds).toEqual(["b"]);
    expect(s.allSelected).toBe(true); // switcher shows the implicit-default state as all
  });

  it("absent param falls back to the first portfolio when none is default", () => {
    const s = parsePortfolioSelection(undefined, [A, C]);
    expect(s.selectedIds).toEqual(["a"]);
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
