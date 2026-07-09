"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/Card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/shadcn/Chart";
import type { EnrichedHolding } from "../dashboard/page";

const GAIN_COLOR = "#059669"; // emerald-600
const LOSS_COLOR = "#ef4444"; // red-500

// Foundation (cost) palette — deliberately excludes green/red so the base
// segment never collides with the gain/loss delta cap above it.
const BASE_PALETTE = [
  "#2563eb", // blue-600
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#0ea5e9", // sky-500
];

function baseColorMap(tickers: string[]): Record<string, string> {
  const unique = Array.from(new Set(tickers));
  return Object.fromEntries(unique.map((ticker, i) => [ticker, BASE_PALETTE[i % BASE_PALETTE.length] ?? "#64748b"]));
}

interface ChartDatum {
  ticker: string;
  base: number;
  delta: number;
  cost: number;
  gain: number;
  gainPct: number | null;
  isGain: boolean;
}

const chartConfig = {
  base: { label: "Cost" },
  delta: { label: "Gain / Loss" },
} satisfies ChartConfig;

function fmt(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function GainLossChart({ holdings, priceCurrency }: { holdings: EnrichedHolding[]; priceCurrency: string }) {
  const colors = baseColorMap(holdings.map((h) => h.ticker));
  const data: ChartDatum[] = holdings
    .filter((h): h is EnrichedHolding & { gain: number; marketValue: number } => h.gain !== null && h.marketValue !== null)
    .map((h) => {
      const gain = h.gain;
      // Stack the cost foundation and the gain/loss cap so both render as
      // positive segments: for a gain the green cap sits above cost, for a
      // loss the red cap sits above market value (capping back up to cost).
      return {
        ticker: h.ticker,
        base: Math.min(h.costBasis, h.marketValue),
        delta: Math.abs(gain),
        cost: h.costBasis,
        gain,
        gainPct: h.gainPct,
        isGain: gain >= 0,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost &amp; Gain / Loss ({priceCurrency})</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No data to chart yet.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <BarChart data={data} margin={{ top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="ticker" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={56} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(_value, name, item) => {
                      const d = item.payload as ChartDatum | undefined;
                      if (!d) return null;
                      if (name === "base") {
                        return `Cost: ${fmt(d.cost)} ${priceCurrency}`;
                      }
                      const sign = d.gain >= 0 ? "+" : "";
                      const pct = d.gainPct != null ? ` (${sign}${fmt(d.gainPct, 1)}%)` : "";
                      return `Gain / Loss: ${sign}${fmt(d.gain)} ${priceCurrency}${pct}`;
                    }}
                  />
                }
              />
              <Bar dataKey="base" stackId="a" radius={[0, 0, 4, 4]}>
                {data.map((d) => (
                  <Cell key={d.ticker} fill={colors[d.ticker]} />
                ))}
              </Bar>
              <Bar dataKey="delta" stackId="a" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.ticker} fill={d.isGain ? GAIN_COLOR : LOSS_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
