"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EnrichedHolding } from "./page";

function fmt(value: number, decimals = 2) {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function GainCell({ value, pct }: { value: number | null; pct?: number | null }) {
  if (value === null) return <TableCell className="text-right font-mono text-muted-foreground">—</TableCell>;
  const positive = value >= 0;
  const color = positive ? "text-emerald-600" : "text-red-500";
  const sign = positive ? "+" : "";
  return (
    <TableCell className={`text-right font-mono ${color}`}>
      {sign}{fmt(value)}
      {pct !== undefined && pct !== null && (
        <span className="ml-1 text-xs opacity-75">({sign}{fmt(pct, 1)}%)</span>
      )}
    </TableCell>
  );
}

export default function HoldingsTable({ holdings }: { holdings: EnrichedHolding[] }) {
  if (holdings.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No positions yet. Log a transaction to get started.
      </p>
    );
  }

  const totalMarketValue = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0);
  const totalCostBasis = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalGain = totalMarketValue - totalCostBasis;
  const totalGainPct = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : null;
  const totalGainColor = totalGain >= 0 ? "text-emerald-600" : "text-red-500";
  const totalGainSign = totalGain >= 0 ? "+" : "";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticker</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Shares</TableHead>
          <TableHead className="text-right">Avg Cost</TableHead>
          <TableHead className="text-right">Current Price</TableHead>
          <TableHead className="text-right">Market Value</TableHead>
          <TableHead className="text-right">Gain / Loss</TableHead>
          <TableHead className="text-right">Portfolio %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((h) => (
          <TableRow key={h.id}>
            <TableCell className="font-mono font-medium">{h.ticker}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{h.name}</TableCell>
            <TableCell className="text-right font-mono">{fmt(h.shares, 4)}</TableCell>
            <TableCell className="text-right font-mono">{fmt(h.avgCost, 4)}</TableCell>
            <TableCell className="text-right font-mono">
              {h.currentPrice !== null ? fmt(h.currentPrice) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="text-right font-mono">
              {h.marketValue !== null ? fmt(h.marketValue) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <GainCell value={h.gain} pct={h.gainPct} />
            <TableCell className="text-right font-mono text-muted-foreground">
              {h.portfolioPct !== null ? `${fmt(h.portfolioPct, 1)}%` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={5} className="font-semibold">Total</TableCell>
          <TableCell className="text-right font-mono font-semibold">{fmt(totalMarketValue)}</TableCell>
          <TableCell className={`text-right font-mono font-semibold ${totalGainColor}`}>
            {totalGainSign}{fmt(totalGain)}
            {totalGainPct !== null && (
              <span className="ml-1 text-xs opacity-75">({totalGainSign}{fmt(totalGainPct, 1)}%)</span>
            )}
          </TableCell>
          <TableCell className="text-right font-mono font-semibold">100%</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
