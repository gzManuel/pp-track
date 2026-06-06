"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const serverUrl = process.env.SERVER_API_URL ?? "http://localhost:3001";

function authHeaders(userId: string) {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": process.env.INTERNAL_API_SECRET!,
    "x-user-id": userId,
  };
}

export async function createPortfolio(name: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const res = await fetch(`${serverUrl}/api/portfolios`, {
    method: "POST",
    headers: authHeaders(session.user.id),
    body: JSON.stringify({ name }),
  });

  if (!res.ok) throw new Error("Failed to create portfolio");
  return res.json();
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
  }
) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const res = await fetch(`${serverUrl}/api/portfolios/${portfolioId}/transactions`, {
    method: "POST",
    headers: authHeaders(session.user.id),
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to log transaction");
  return res.json();
}

export async function deleteTransaction(portfolioId: string, txId: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const res = await fetch(
    `${serverUrl}/api/portfolios/${portfolioId}/transactions/${txId}`,
    {
      method: "DELETE",
      // No JSON body on delete — omit Content-Type so Fastify doesn't reject an empty body.
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
        "x-user-id": session.user.id,
      },
    }
  );

  if (!res.ok) throw new Error("Failed to delete transaction");
}
