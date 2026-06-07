"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/Card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/shadcn/Chart";
import type { EnrichedHolding } from "../page";
import { tickerColorMap } from "./chartColors";

function fmt(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function AllocationChart({
  holdings,
  priceCurrency,
}: {
  holdings: EnrichedHolding[];
  priceCurrency: string;
}) {
  const colors = tickerColorMap(holdings.map((h) => h.ticker));
  const data = holdings
    .filter((h) => h.marketValue !== null)
    .map((h) => ({
      ticker: h.ticker,
      value: h.marketValue as number,
      pct: h.portfolioPct,
      fill: colors[h.ticker],
    }))
    .sort((a, b) => b.value - a.value);

  const chartConfig: ChartConfig = Object.fromEntries(
    data.map((d) => [d.ticker, { label: d.ticker, color: d.fill }])
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data to chart yet.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[280px]"
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="ticker"
                    hideLabel
                    formatter={(value, name, item) =>
                      `${name}: ${fmt(Number(value))} ${priceCurrency}${
                        item?.payload?.pct != null
                          ? ` (${fmt(item.payload.pct, 1)}%)`
                          : ""
                      }`
                    }
                  />
                }
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="ticker"
                innerRadius={60}
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.ticker} fill={d.fill} />
                ))}
              </Pie>
              <ChartLegend
                content={<ChartLegendContent nameKey="ticker" />}
                className="-mt-2 flex-wrap gap-2 [&>*]:basis-auto"
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
