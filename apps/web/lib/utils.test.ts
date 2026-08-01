import { describe, it, expect } from "vitest";
import { cn, formatMoney } from "./utils";

describe("utils", () => {
  describe("cn", () => {
    it("should merge class names", () => {
      expect(cn("px-2", "py-4")).toContain("px-2");
      expect(cn("px-2", "py-4")).toContain("py-4");
    });

    it("should remove falsy values", () => {
      expect(cn("px-2", false, "py-4", null, undefined)).toBe("px-2 py-4");
    });

    it("should handle conflicting Tailwind classes, later wins", () => {
      // tailwind-merge should resolve p-2 and p-4 with p-4 winning
      const result = cn("p-2", "p-4");
      expect(result).toContain("p-4");
      expect(result).not.toContain("p-2");
    });

    it("should handle conflicting padding classes", () => {
      const result = cn("px-2", "px-8");
      expect(result).toContain("px-8");
    });

    it("should handle conflicting margin classes", () => {
      const result = cn("mx-1", "mx-4");
      expect(result).toContain("mx-4");
    });

    it("should merge non-conflicting classes", () => {
      const result = cn("px-4", "py-2", "bg-white");
      expect(result).toContain("px-4");
      expect(result).toContain("py-2");
      expect(result).toContain("bg-white");
    });

    it("should handle array inputs", () => {
      const result = cn(["px-2", "py-4"], "bg-white");
      expect(result).toContain("px-2");
      expect(result).toContain("py-4");
      expect(result).toContain("bg-white");
    });

    it("should handle object inputs with truthy values", () => {
      const result = cn({
        "px-2": true,
        "py-4": true,
        "bg-white": false,
      });
      expect(result).toContain("px-2");
      expect(result).toContain("py-4");
      expect(result).not.toContain("bg-white");
    });
  });

  describe("formatMoney", () => {
    it("should format with default 2 decimal places", () => {
      expect(formatMoney(1234.56)).toBe("1,234.56");
    });

    it("should format whole numbers with decimal places", () => {
      expect(formatMoney(1000)).toBe("1,000.00");
    });

    it("should add thousand separators", () => {
      expect(formatMoney(1234567.89)).toBe("1,234,567.89");
    });

    it("should format negative numbers", () => {
      expect(formatMoney(-1234.56)).toBe("-1,234.56");
    });

    it("should format zero", () => {
      expect(formatMoney(0)).toBe("0.00");
    });

    it("should use custom decimal places", () => {
      expect(formatMoney(1234.5678, 3)).toBe("1,234.568");
    });

    it("should format with zero decimals", () => {
      expect(formatMoney(1234.56, 0)).toBe("1,235");
    });

    it("should format large numbers", () => {
      expect(formatMoney(999999999.99)).toBe("999,999,999.99");
    });

    it("should format very small numbers", () => {
      expect(formatMoney(0.01)).toBe("0.01");
    });

    it("should handle scientific notation input", () => {
      expect(formatMoney(1e3)).toBe("1,000.00");
    });
  });
});
