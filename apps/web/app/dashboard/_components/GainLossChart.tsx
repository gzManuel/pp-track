"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/Card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/shadcn/Chart";
import type { EnrichedHolding } from "../page";
import { tickerColorMap } from "./chartColors";

const chartConfig = {
  gain: { label: "Gain / Loss" },
} satisfies ChartConfig;

function fmt(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function GainLossChart({
  holdings,
  priceCurrency,
}: {
  holdings: EnrichedHolding[];
  priceCurrency: string;
}) {
  const colors = tickerColorMap(holdings.map((h) => h.ticker));
  const data = holdings
    .filter((h) => h.gain !== null)
    .map((h) => ({
      ticker: h.ticker,
      gain: h.gain as number,
      gainPct: h.gainPct,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gain / Loss ({priceCurrency})</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data to chart yet.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full"
          >
            <BarChart data={data} margin={{ top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ticker"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis tickLine={false} axisLine={false} width={56} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const v = Number(value);
                      const sign = v >= 0 ? "+" : "";
                      return `${sign}${fmt(v)} ${priceCurrency}${
                        item?.payload?.gainPct != null
                          ? ` (${sign}${fmt(item.payload.gainPct, 1)}%)`
                          : ""
                      }`;
                    }}
                  />
                }
              />
              <Bar dataKey="gain" radius={4}>
                {data.map((d) => (
                  <Cell key={d.ticker} fill={colors[d.ticker]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
