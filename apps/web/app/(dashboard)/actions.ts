"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/server-api";
import {
  portfolioNameSchema,
  transactionPayloadSchema,
  updateTransactionPayloadSchema,
  type TransactionPayload,
  type UpdateTransactionPayload,
} from "@/lib/schemas";

const JSON_HEADERS = { "Content-Type": "application/json" };

// Server actions are public HTTP endpoints — every input is re-validated here
// with the shared schemas, regardless of what the client-side forms enforce.

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string;
  source: "portfolio" | "yahoo";
}

async function requireUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");
  return session.user.id;
}

export async function searchTickers(query: string): Promise<TickerSearchResult[]> {
  const q = z.string().max(100).parse(query).trim();
  if (!q) return [];

  const userId = await requireUserId();

  const res = await serverFetch(`/api/assets/search?q=${encodeURIComponent(q)}`, { userId });

  if (!res.ok) throw new Error("Failed to search tickers");
  return (await res.json()) as TickerSearchResult[];
}

export async function createPortfolio(name: string) {
  const userId = await requireUserId();
  const parsedName = portfolioNameSchema.parse(name);

  const res = await serverFetch(`/api/portfolios`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: parsedName }),
    userId,
  });

  if (!res.ok) throw new Error("Failed to create portfolio");
}

export async function logTransaction(portfolioId: string, data: TransactionPayload) {
  const userId = await requireUserId();
  const id = z.uuid().parse(portfolioId);
  const payload = transactionPayloadSchema.parse(data);

  const res = await serverFetch(`/api/portfolios/${id}/transactions`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
    userId,
  });

  if (!res.ok) throw new Error("Failed to log transaction");
}

export async function updateTransaction(portfolioId: string, txId: string, data: UpdateTransactionPayload) {
  const userId = await requireUserId();
  const id = z.uuid().parse(portfolioId);
  const tx = z.uuid().parse(txId);
  const payload = updateTransactionPayloadSchema.parse(data);

  const res = await serverFetch(`/api/portfolios/${id}/transactions/${tx}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
    userId,
  });

  if (!res.ok) throw new Error("Failed to update transaction");
}

export async function deleteTransaction(portfolioId: string, txId: string) {
  const userId = await requireUserId();
  const id = z.uuid().parse(portfolioId);
  const tx = z.uuid().parse(txId);

  // No JSON body on delete — omit Content-Type so Fastify doesn't reject an empty body.
  const res = await serverFetch(`/api/portfolios/${id}/transactions/${tx}`, {
    method: "DELETE",
    userId,
  });

  if (!res.ok) throw new Error("Failed to delete transaction");
}
