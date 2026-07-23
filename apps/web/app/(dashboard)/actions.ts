"use server";

import { revalidatePath } from "next/cache";
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
//
// Mutations return an ActionResult instead of throwing: a thrown error inside a
// client transition unmounts the page into the route error boundary (losing the
// user's form input), while a returned failure lets the caller keep the dialog
// open and show a toast/inline message.

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Message for a failed backend response. Business-rule rejections (422, e.g.
 * overselling) carry a user-appropriate message from the API — surface it.
 * Everything else gets the generic fallback so internals never reach the UI.
 */
async function failureMessage(res: Response, fallback: string): Promise<string> {
  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) return body.error;
  }
  return fallback;
}

// Every mutation can change holdings/transactions/portfolio summaries, so all
// three views are revalidated together — cheap, and callers never see stale
// data on their next navigation.
function revalidateAppViews() {
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/portfolios");
}

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

export async function createPortfolio(name: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsedName = portfolioNameSchema.parse(name);

  const res = await serverFetch(`/api/portfolios`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: parsedName }),
    userId,
  });

  if (!res.ok) return { ok: false, error: await failureMessage(res, "Failed to create portfolio") };
  revalidateAppViews();
  return { ok: true };
}

export async function logTransaction(portfolioId: string, data: TransactionPayload): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = z.uuid().parse(portfolioId);
  const payload = transactionPayloadSchema.parse(data);

  const res = await serverFetch(`/api/portfolios/${id}/transactions`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
    userId,
  });

  if (!res.ok) return { ok: false, error: await failureMessage(res, "Failed to log transaction") };
  revalidateAppViews();
  return { ok: true };
}

export async function updateTransaction(portfolioId: string, txId: string, data: UpdateTransactionPayload): Promise<ActionResult> {
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

  if (!res.ok) return { ok: false, error: await failureMessage(res, "Failed to update transaction") };
  revalidateAppViews();
  return { ok: true };
}

export async function deleteTransaction(portfolioId: string, txId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = z.uuid().parse(portfolioId);
  const tx = z.uuid().parse(txId);

  // No JSON body on delete — omit Content-Type so Fastify doesn't reject an empty body.
  const res = await serverFetch(`/api/portfolios/${id}/transactions/${tx}`, {
    method: "DELETE",
    userId,
  });

  if (!res.ok) return { ok: false, error: await failureMessage(res, "Failed to delete transaction") };
  revalidateAppViews();
  return { ok: true };
}
