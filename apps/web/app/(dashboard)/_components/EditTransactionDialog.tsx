"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/shadcn/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/Dialog";
import LogTransactionForm, { type EditableTransaction } from "./LogTransactionForm";

export default function EditTransactionDialog({
  transaction,
  portfolios,
}: {
  transaction: EditableTransaction;
  portfolios: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Edit transaction">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription>Update this transaction. Holdings are recalculated when you save.</DialogDescription>
        </DialogHeader>
        {/* Remount per open so the form re-seeds from the latest row data. */}
        <LogTransactionForm
          key={open ? transaction.id : "closed"}
          portfolios={portfolios}
          defaultPortfolioId={transaction.portfolioId}
          transaction={transaction}
          onSuccess={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
