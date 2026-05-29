"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
}

export default function TransactionsTable({
  transactions,
}: {
  transactions: Transaction[];
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
          <TableHead>Ticker</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead>Currency</TableHead>
          <TableHead className="text-right">Fee</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(tx.transactedAt).toLocaleDateString()}
            </TableCell>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
