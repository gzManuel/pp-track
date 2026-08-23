"use client";

import type { Currency } from "@repo/api-contract";
import { currencySymbol, displayTicker, transactionPriceIn } from "@/lib/currency";
import { Badge } from "@/components/shadcn/Badge";
import { Card, CardContent } from "@/components/shadcn/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/Table";
import Money from "../Money";
import DeleteTransactionButton from "./DeleteTransactionButton";
import EditTransactionDialog from "./EditTransactionDialog";

interface Transaction {
  id: string;
  type: string;
  quantity: string;
  price: string;
  currency: Currency;
  mepRate: string | null;
  cclRate: string | null;
  fee: string;
  notes: string | null;
  transactedAt: string;
  asset: { ticker: string; name: string };
  portfolioId: string;
  portfolioName: string;
}

/**
 * Price stays exactly as entered — that is the record. The total is shown in
 * the active view so rows in different currencies can be compared; a legacy row
 * with no rate snapshot falls back to its own currency.
 */
function deriveRow(tx: Transaction, viewCurrency: Currency) {
  const viewPrice = transactionPriceIn(tx, viewCurrency);
  const viewFee = transactionPriceIn({ ...tx, price: tx.fee }, viewCurrency);
  const converted = viewPrice !== null && viewFee !== null;
  const unitPrice = converted ? viewPrice : Number(tx.price);
  const unitFee = converted ? viewFee : Number(tx.fee);
  const total = Number(tx.quantity) * unitPrice + (tx.type === "BUY" ? unitFee : -unitFee);
  return { converted, total, totalLabel: converted ? currencySymbol(viewCurrency) : tx.currency };
}

/** Props shared by the two action controls, built once per row. */
function editableFrom(tx: Transaction) {
  return {
    id: tx.id,
    portfolioId: tx.portfolioId,
    ticker: tx.asset.ticker,
    type: tx.type,
    quantity: tx.quantity,
    price: tx.price,
    currency: tx.currency,
    transactedAt: tx.transactedAt,
    fee: tx.fee,
    notes: tx.notes,
  };
}

function deleteLabel(tx: Transaction) {
  return `${tx.type} ${Number(tx.quantity).toFixed(4)} ${tx.asset.ticker}`;
}

/** Label / value row inside a mobile transaction card. */
function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  );
}

export default function TransactionsTable({
  transactions,
  showPortfolio,
  portfolios,
  viewCurrency,
}: {
  transactions: Transaction[];
  showPortfolio: boolean;
  portfolios: { id: string; name: string }[];
  /** Currency the Total column is expressed in; Price stays as entered. */
  viewCurrency: Currency;
}) {
  if (transactions.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No transactions yet. Log your first one to get started.</p>;
  }

  return (
    <>
      {/* Mobile: one card per transaction — 11 columns cannot fit a phone. */}
      <div className="flex flex-col gap-3 md:hidden">
        {transactions.map((tx) => {
          const { total, totalLabel } = deriveRow(tx, viewCurrency);
          const ticker = displayTicker(tx.asset.ticker);
          return (
            <Card key={tx.id} size="sm">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono font-medium">{ticker.label}</span>
                    {ticker.isCedear && <span className="ml-1.5 text-[10px] font-sans text-muted-foreground">CEDEAR</span>}
                    {/* Slice the stored UTC calendar day directly — converting through a
                        local Date would show the previous day for viewers west of UTC. */}
                    <p className="text-xs text-muted-foreground">{tx.transactedAt.slice(0, 10)}</p>
                  </div>
                  <Badge variant={tx.type === "BUY" ? "default" : "secondary"}>{tx.type}</Badge>
                </div>
                <dl className="flex flex-col gap-1.5">
                  {showPortfolio && (
                    <CardRow label="Portfolio">
                      <span className="font-sans">{tx.portfolioName}</span>
                    </CardRow>
                  )}
                  <CardRow label="Quantity">{Number(tx.quantity).toFixed(4)}</CardRow>
                  <CardRow label={`Price (${tx.currency})`}>
                    <Money value={Number(tx.price)} />
                  </CardRow>
                  <CardRow label="Fee">{Number(tx.fee) > 0 ? <Money value={Number(tx.fee)} /> : "—"}</CardRow>
                  <CardRow label="Total">
                    <span className="font-medium">
                      <Money value={total} /> <span className="text-muted-foreground">{totalLabel}</span>
                    </span>
                  </CardRow>
                  {/* Length check (not `?? "—"`) so empty-string notes also fall back to the dash. */}
                  {tx.notes?.length ? (
                    <div className="flex flex-col gap-0.5 pt-1">
                      <dt className="text-xs text-muted-foreground">Notes</dt>
                      <dd className="text-sm break-words">{tx.notes}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="flex gap-2">
                  <EditTransactionDialog wideTrigger portfolios={portfolios} transaction={editableFrom(tx)} />
                  <DeleteTransactionButton wideTrigger portfolioId={tx.portfolioId} txId={tx.id} label={deleteLabel(tx)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {showPortfolio && <TableHead>Portfolio</TableHead>}
              <TableHead>Ticker</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Total ({viewCurrency})</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const { total, totalLabel } = deriveRow(tx, viewCurrency);

              return (
                <TableRow key={tx.id}>
                  {/* Slice the stored UTC calendar day directly — converting through a
                      local Date would show the previous day for viewers west of UTC. */}
                  <TableCell className="text-sm text-muted-foreground">{tx.transactedAt.slice(0, 10)}</TableCell>
                  {showPortfolio && <TableCell className="text-sm text-muted-foreground">{tx.portfolioName}</TableCell>}
                  <TableCell className="font-mono font-medium">
                    {displayTicker(tx.asset.ticker).label}
                    {displayTicker(tx.asset.ticker).isCedear && (
                      <span className="ml-1.5 text-[10px] font-sans text-muted-foreground">CEDEAR</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.type === "BUY" ? "default" : "secondary"}>{tx.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{Number(tx.quantity).toFixed(4)}</TableCell>
                  <TableCell className="text-right font-mono">
                    <Money value={Number(tx.price)} />
                  </TableCell>
                  <TableCell>{tx.currency}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {Number(tx.fee) > 0 ? <Money value={Number(tx.fee)} /> : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    <Money value={total} /> <span className="text-muted-foreground">{totalLabel}</span>
                  </TableCell>
                  {/* Length check (not `?? "—"`) so empty-string notes also fall back to the dash. */}
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{tx.notes?.length ? tx.notes : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <EditTransactionDialog portfolios={portfolios} transaction={editableFrom(tx)} />
                      <DeleteTransactionButton portfolioId={tx.portfolioId} txId={tx.id} label={deleteLabel(tx)} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
