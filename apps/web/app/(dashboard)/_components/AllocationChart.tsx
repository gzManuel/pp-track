"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/Card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/shadcn/Chart";
import type { EnrichedHolding } from "@/lib/types";
import { formatMoney as fmt } from "@/lib/utils";
import { tickerColorMap } from "./chartColors";

const RADIAN = Math.PI / 180;

// Draw each slice's allocation percentage centered in the donut band, so the split is
// readable without hovering. recharts passes the slice geometry and its datum payload.
function renderSliceLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  payload,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  payload: { pct: number | null };
}) {
  if (payload.pct == null) return null;
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" className="text-xs font-medium">
      {fmt(payload.pct, payload.pct < 10 ? 1 : 0)}%
    </text>
  );
}

export default function AllocationChart({ holdings, priceCurrency }: { holdings: EnrichedHolding[]; priceCurrency: string }) {
  const colors = tickerColorMap(holdings.map((h) => h.ticker));
  const data = holdings
    .filter((h): h is EnrichedHolding & { marketValue: number } => h.marketValue !== null)
    .map((h) => ({
      ticker: h.ticker,
      value: h.marketValue,
      pct: h.portfolioPct,
      fill: colors[h.ticker],
    }))
    .sort((a, b) => b.value - a.value);

  const chartConfig: ChartConfig = Object.fromEntries(data.map((d) => [d.ticker, { label: d.ticker, color: d.fill }]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No data to chart yet.</p>
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[350px]">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="ticker"
                    hideLabel
                    formatter={(value, name, item) => {
                      const pct = (item.payload as { pct?: number | null }).pct;
                      const pctStr = pct != null ? ` (${fmt(pct, 1)}%)` : "";
                      return `${String(name)}: ${fmt(Number(value))} ${priceCurrency}${pctStr}`;
                    }}
                  />
                }
              />
              <Pie data={data} dataKey="value" nameKey="ticker" innerRadius={75} strokeWidth={2} labelLine={false} label={renderSliceLabel}>
                {data.map((d) => (
                  <Cell key={d.ticker} fill={d.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="ticker" />} className="-mt-2 flex-wrap gap-2 [&>*]:basis-auto" />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
