"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/shadcn/Button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/shadcn/Form";
import { Input } from "@/components/shadcn/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/Select";
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

const schema = z.object({
  portfolioId: z.string().min(1, "Required"),
  ticker: z.string().min(1, "Required"),
  type: z.enum(["BUY", "SELL"]),
  quantity: z
    .string()
    .min(1, "Required")
    .refine((v) => Number(v) > 0, "Must be positive"),
  price: z
    .string()
    .min(1, "Required")
    .refine((v) => Number(v) > 0, "Must be positive"),
  currency: z.enum(["USD", "ARS"]),
  transactedAt: z.string().min(1, "Required"),
  fee: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

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
  const router = useRouter();
  const submitLabel = transaction ? "Save changes" : "Save transaction";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: transaction
      ? {
          portfolioId: transaction.portfolioId,
          ticker: transaction.ticker,
          type: transaction.type === "SELL" ? "SELL" : "BUY",
          quantity: String(Number(transaction.quantity)),
          price: String(Number(transaction.price)),
          currency: transaction.currency === "ARS" ? "ARS" : "USD",
          // Stored timestamps are anchored to a calendar day; render it for <input type="date">.
          transactedAt: new Date(transaction.transactedAt).toLocaleDateString(
            "en-CA",
          ),
          fee:
            Number(transaction.fee) > 0 ? String(Number(transaction.fee)) : "",
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
      const { portfolioId, ...data } = values;
      const payload = {
        ...data,
        quantity: Number(values.quantity),
        price: Number(values.price),
        fee: values.fee ? Number(values.fee) : undefined,
      };

      if (transaction) {
        await updateTransaction(transaction.portfolioId, transaction.id, {
          ...payload,
          portfolioId,
        });
      } else {
        await logTransaction(portfolioId, payload);
        form.reset();
      }

      router.refresh();
      onSuccess?.();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
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
                  <TickerCombobox
                    value={field.value}
                    onChange={field.onChange}
                  />
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
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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
                  <Input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    {...field}
                  />
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
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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

        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
