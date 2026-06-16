"use client";

import { Badge } from "@/components/shadcn/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/Table";
import DeleteTransactionButton from "./DeleteTransactionButton";
import EditTransactionDialog from "./EditTransactionDialog";

interface Transaction {
  id: string;
  type: string;
  quantity: string;
  price: string;
  currency: string;
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
}: {
  transactions: Transaction[];
  showPortfolio: boolean;
  portfolios: { id: string; name: string }[];
}) {
  if (transactions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No transactions yet. Log your first one to get started.
      </p>
    );
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
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(tx.transactedAt).toLocaleDateString()}
            </TableCell>
            {showPortfolio && (
              <TableCell className="text-sm text-muted-foreground">
                {tx.portfolioName}
              </TableCell>
            )}
            <TableCell className="font-mono font-medium">
              {tx.asset.ticker}
            </TableCell>
            <TableCell>
              <Badge variant={tx.type === "BUY" ? "default" : "secondary"}>
                {tx.type}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-mono">
              {Number(tx.quantity).toFixed(4)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {Number(tx.price).toFixed(2)}
            </TableCell>
            <TableCell>{tx.currency}</TableCell>
            <TableCell className="text-right font-mono text-muted-foreground">
              {Number(tx.fee) > 0 ? Number(tx.fee).toFixed(2) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono font-medium">
              {(
                Number(tx.quantity) * Number(tx.price) +
                (tx.type === "BUY" ? Number(tx.fee) : -Number(tx.fee))
              ).toFixed(2)}{" "}
              <span className="text-muted-foreground">{tx.currency}</span>
            </TableCell>
            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
              {tx.notes || "—"}
            </TableCell>
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
        ))}
      </TableBody>
    </Table>
  );
}
