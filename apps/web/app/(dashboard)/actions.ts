"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/server-api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string;
  source: "portfolio" | "yahoo";
}

export async function searchTickers(query: string): Promise<TickerSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const res = await serverFetch(`/api/assets/search?q=${encodeURIComponent(q)}`, { userId: session.user.id });

  if (!res.ok) throw new Error("Failed to search tickers");
  return (await res.json()) as TickerSearchResult[];
}

export async function createPortfolio(name: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const res = await serverFetch(`/api/portfolios`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
    userId: session.user.id,
  });

  if (!res.ok) throw new Error("Failed to create portfolio");
}

export async function logTransaction(
  portfolioId: string,
  data: {
    ticker: string;
    type: string;
    quantity: number;
    price: number;
    currency: string;
    transactedAt: string;
    fee?: number;
    notes?: string;
  },
) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const res = await serverFetch(`/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
    userId: session.user.id,
  });

  if (!res.ok) throw new Error("Failed to log transaction");
}

export async function updateTransaction(
  portfolioId: string,
  txId: string,
  data: {
    portfolioId?: string;
    ticker: string;
    type: string;
    quantity: number;
    price: number;
    currency: string;
    transactedAt: string;
    fee?: number;
    notes?: string;
  },
) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const res = await serverFetch(`/api/portfolios/${portfolioId}/transactions/${txId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
    userId: session.user.id,
  });

  if (!res.ok) throw new Error("Failed to update transaction");
}

export async function deleteTransaction(portfolioId: string, txId: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  // No JSON body on delete — omit Content-Type so Fastify doesn't reject an empty body.
  const res = await serverFetch(`/api/portfolios/${portfolioId}/transactions/${txId}`, {
    method: "DELETE",
    userId: session.user.id,
  });

  if (!res.ok) throw new Error("Failed to delete transaction");
}
