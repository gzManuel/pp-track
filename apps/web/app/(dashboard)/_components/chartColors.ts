// Distinct categorical palette for per-ticker chart colors. The theme's
// --chart-1..5 vars are grayscale, so we use explicit hues here instead.
export const CHART_PALETTE = [
  "#2563eb", // blue-600
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#84cc16", // lime-500
];

/**
 * Maps each ticker to a stable color from CHART_PALETTE. Driven by the order of
 * `tickers` passed in — call it with the same holdings list in every chart so a
 * given ticker keeps the same color across charts.
 */
export function tickerColorMap(tickers: string[]): Record<string, string> {
  const unique = Array.from(new Set(tickers));
  return Object.fromEntries(unique.map((ticker, i) => [ticker, CHART_PALETTE[i % CHART_PALETTE.length] ?? "#64748b"]));
}
