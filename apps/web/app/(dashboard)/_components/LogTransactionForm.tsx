"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toTransactionPayload, transactionFormSchema, type TransactionFormValues } from "@/lib/schemas";
import { Button } from "@/components/shadcn/Button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/shadcn/Form";
import { Input } from "@/components/shadcn/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/Select";
import { logTransaction, updateTransaction } from "../actions";
import TickerCombobox from "./TickerCombobox";

// When present, the form edits this transaction instead of logging a new one.
export interface EditableTransaction {
  id: string;
  portfolioId: string;
  ticker: string;
  type: string;
  quantity: string;
  price: string;
  currency: string;
  transactedAt: string;
  fee: string;
  notes: string | null;
}

type FormValues = TransactionFormValues;

export default function LogTransactionForm({
  portfolios,
  defaultPortfolioId,
  transaction,
  onSuccess,
}: {
  portfolios: { id: string; name: string }[];
  defaultPortfolioId: string;
  transaction?: EditableTransaction;
  onSuccess?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const submitLabel = transaction ? "Save changes" : "Save transaction";

  const form = useForm<FormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: transaction
      ? {
          portfolioId: transaction.portfolioId,
          ticker: transaction.ticker,
          type: transaction.type === "SELL" ? "SELL" : "BUY",
          quantity: String(Number(transaction.quantity)),
          price: String(Number(transaction.price)),
          currency: transaction.currency === "ARS" ? "ARS" : "USD",
          // Stored timestamps are anchored to a UTC calendar day — slice the ISO
          // date directly. Round-tripping through Date/toLocaleDateString would
          // shift the day for viewers west of UTC (e.g. Argentina, UTC-3).
          transactedAt: transaction.transactedAt.slice(0, 10),
          fee: Number(transaction.fee) > 0 ? String(Number(transaction.fee)) : "",
          notes: transaction.notes ?? "",
        }
      : {
          portfolioId: defaultPortfolioId,
          ticker: "",
          type: "BUY",
          quantity: undefined,
          price: undefined,
          currency: "USD",
          transactedAt: new Date().toLocaleDateString("en-CA"),
          fee: undefined,
          notes: "",
        },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const { portfolioId } = values;
      const payload = toTransactionPayload(values);

      // Failures come back as a result (not a throw) so the form stays mounted
      // and the user's input survives — surfaced as a toast + inline message.
      const result = transaction
        ? await updateTransaction(transaction.portfolioId, transaction.id, { ...payload, portfolioId })
        : await logTransaction(portfolioId, payload);

      if (!result.ok) {
        form.setError("root", { message: result.error });
        toast.error(result.error);
        return;
      }

      toast.success(transaction ? "Transaction updated" : "Transaction logged");
      if (!transaction) form.reset();
      onSuccess?.();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="portfolioId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Portfolio</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {portfolios.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="ticker"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Ticker</FormLabel>
                <FormControl>
                  <TickerCombobox value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price per share</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="transactedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="fee"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fee (optional)</FormLabel>
              <FormControl>
                <Input type="number" step="any" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Any notes..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
