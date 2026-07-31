"use client";

import type { Currency } from "@repo/api-contract";
import { currencySymbol, displayTicker, transactionPriceIn } from "@/lib/currency";
import { Badge } from "@/components/shadcn/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/Table";
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
          // Price stays exactly as entered — that is the record. The total is
          // shown in the active view so rows in different currencies can be
          // compared; a legacy row with no rate snapshot falls back to its own.
          const viewPrice = transactionPriceIn(tx, viewCurrency);
          const viewFee = transactionPriceIn({ ...tx, price: tx.fee }, viewCurrency);
          const converted = viewPrice !== null && viewFee !== null;
          const totalCurrency = converted ? viewCurrency : tx.currency;
          const unitPrice = converted ? viewPrice : Number(tx.price);
          const unitFee = converted ? viewFee : Number(tx.fee);

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
              <TableCell className="text-right font-mono">{Number(tx.price).toFixed(2)}</TableCell>
              <TableCell>{tx.currency}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {Number(tx.fee) > 0 ? Number(tx.fee).toFixed(2) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {(Number(tx.quantity) * unitPrice + (tx.type === "BUY" ? unitFee : -unitFee)).toFixed(2)}{" "}
                <span className="text-muted-foreground">{converted ? currencySymbol(viewCurrency) : totalCurrency}</span>
              </TableCell>
              {/* Length check (not `?? "—"`) so empty-string notes also fall back to the dash. */}
              <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{tx.notes?.length ? tx.notes : "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <EditTransactionDialog
                    portfolios={portfolios}
                    transaction={{
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
                    }}
                  />
                  <DeleteTransactionButton
                    portfolioId={tx.portfolioId}
                    txId={tx.id}
                    label={`${tx.type} ${Number(tx.quantity).toFixed(4)} ${tx.asset.ticker}`}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
