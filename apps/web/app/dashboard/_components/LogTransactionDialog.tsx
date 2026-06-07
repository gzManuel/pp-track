"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/shadcn/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/Dialog";
import LogTransactionForm from "./LogTransactionForm";

export default function LogTransactionDialog({
  portfolioId,
}: {
  portfolioId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Log transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log transaction</DialogTitle>
        </DialogHeader>
        <LogTransactionForm
          portfolioId={portfolioId}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
