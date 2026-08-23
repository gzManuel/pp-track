"use client";

import { displayTicker } from "@/lib/currency";
import { Card, CardContent } from "@/components/shadcn/Card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/shadcn/Table";
import type { EnrichedHolding } from "@/lib/types";
import { formatMoney as fmt } from "@/lib/utils";
import Money from "../Money";
import Shares from "../Shares";

function gainColor(value: number) {
  return value >= 0 ? "text-emerald-600" : "text-red-500";
}

/** `+1,234.56 (+12.4%)` — shared by the desktop table cell and the mobile card. */
function GainValue({ value, pct }: { value: number; pct?: number | null }) {
  const sign = value >= 0 ? "+" : "";
  return (
    <>
      <Money value={value} signed />
      {pct !== undefined && pct !== null && (
        <span className="ml-1 text-xs opacity-75">
          ({sign}
          {fmt(pct, 1)}%)
        </span>
      )}
    </>
  );
}

function GainCell({ value, pct }: { value: number | null; pct?: number | null }) {
  if (value === null) return <TableCell className="text-right font-mono text-muted-foreground">—</TableCell>;
  return (
    <TableCell className={`text-right font-mono ${gainColor(value)}`}>
      <GainValue value={value} pct={pct} />
    </TableCell>
  );
}

/** Label / value row inside a mobile holding card. */
function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  );
}

export default function HoldingsTable({ holdings, priceCurrency = "USD" }: { holdings: EnrichedHolding[]; priceCurrency?: string }) {
  if (holdings.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No positions yet. Log a transaction to get started.</p>;
  }

  const totalMarketValue = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0);
  const totalCostBasis = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalGain = totalMarketValue - totalCostBasis;
  const totalGainPct = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : null;
  const totalGainColor = gainColor(totalGain);
  const totalGainSign = totalGain >= 0 ? "+" : "";

  return (
    <>
      {/* Mobile: one card per position — 8 columns cannot fit a phone. */}
      <div className="flex flex-col gap-3 md:hidden">
        {holdings.map((h) => {
          const ticker = displayTicker(h.ticker);
          return (
            <Card key={h.id} size="sm">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono font-medium">{ticker.label}</span>
                    {ticker.isCedear && <span className="ml-1.5 text-[10px] font-sans text-muted-foreground">CEDEAR</span>}
                    <p className="truncate text-xs text-muted-foreground">{h.name}</p>
                  </div>
                  {h.gainPct !== null && (
                    <span className={`shrink-0 font-mono text-sm ${gainColor(h.gainPct)}`}>
                      {h.gainPct >= 0 ? "+" : ""}
                      {fmt(h.gainPct, 1)}%
                    </span>
                  )}
                </div>
                <dl className="flex flex-col gap-1.5">
                  <CardRow label="Shares">
                    <Shares value={h.shares} />
                  </CardRow>
                  <CardRow label="Avg cost">
                    <Money value={h.avgCost} decimals={4} />
                  </CardRow>
                  <CardRow label={`Current price (${priceCurrency})`}>
                    {h.currentPrice !== null ? <Money value={h.currentPrice} /> : <span className="text-muted-foreground">—</span>}
                  </CardRow>
                  <CardRow label={`Market value (${priceCurrency})`}>
                    {h.marketValue !== null ? <Money value={h.marketValue} /> : <span className="text-muted-foreground">—</span>}
                  </CardRow>
                  <CardRow label="Gain / loss">
                    {h.gain !== null ? (
                      <span className={gainColor(h.gain)}>
                        <GainValue value={h.gain} pct={h.gainPct} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </CardRow>
                  <CardRow label="Portfolio %">{h.portfolioPct !== null ? `${fmt(h.portfolioPct, 1)}%` : "—"}</CardRow>
                </dl>
              </CardContent>
            </Card>
          );
        })}
        <Card size="sm" className="bg-muted/50">
          <CardContent className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold">Total market value</span>
              <span className="font-mono text-sm font-semibold">
                <Money value={totalMarketValue} />
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold">Total gain / loss</span>
              <span className={`font-mono text-sm font-semibold ${totalGainColor}`}>
                <GainValue value={totalGain} pct={totalGainPct} />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Current Price ({priceCurrency})</TableHead>
              <TableHead className="text-right">Market Value ({priceCurrency})</TableHead>
              <TableHead className="text-right">Gain / Loss</TableHead>
              <TableHead className="text-right">Portfolio %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="font-mono font-medium">
                  {displayTicker(h.ticker).label}
                  {displayTicker(h.ticker).isCedear && <span className="ml-1.5 text-[10px] font-sans text-muted-foreground">CEDEAR</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{h.name}</TableCell>
                <TableCell className="text-right font-mono">
                  <Shares value={h.shares} />
                </TableCell>
                <TableCell className="text-right font-mono">
                  <Money value={h.avgCost} decimals={4} />
                </TableCell>
                <TableCell className="text-right font-mono">
                  {h.currentPrice !== null ? <Money value={h.currentPrice} /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {h.marketValue !== null ? <Money value={h.marketValue} /> : <span className="text-muted-foreground">—</span>}
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
              <TableCell colSpan={5} className="font-semibold">
                Total
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                <Money value={totalMarketValue} />
              </TableCell>
              <TableCell className={`text-right font-mono font-semibold ${totalGainColor}`}>
                <Money value={totalGain} signed />
                {totalGainPct !== null && (
                  <span className="ml-1 text-xs opacity-75">
                    ({totalGainSign}
                    {fmt(totalGainPct, 1)}%)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">100%</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}
