import type { Portfolio, PrismaClient, Transaction } from "@prisma/client";
import { HttpError } from "../http-error.js";

/**
 * Ownership guards. Every user-scoped route must prove the caller owns the
 * portfolio it is about to read or mutate; centralizing that here means a new
 * route cannot quietly ship without the check, and the 404 message stays
 * identical across handlers (never revealing whether the id exists at all).
 *
 * These throw `HttpError` rather than writing to the reply, so handlers stay
 * expression-shaped and the global error handler in `app.ts` renders the
 * response — which the routes' `404: errorResponse` schema then serializes.
 */

export type PortfolioClient = Pick<PrismaClient, "portfolio">;
export type TransactionLookupClient = Pick<PrismaClient, "transaction">;

/** The caller's portfolio, or a 404 if it doesn't exist or isn't theirs. */
export async function requirePortfolio(
  client: PortfolioClient,
  portfolioId: string,
  userId: string,
  notFoundMessage = "Portfolio not found",
): Promise<Portfolio> {
  const portfolio = await client.portfolio.findFirst({ where: { id: portfolioId, userId } });
  if (!portfolio) throw new HttpError(404, notFoundMessage);
  return portfolio;
}

/**
 * A transaction belonging to `portfolioId`, or a 404. Scoping the lookup to the
 * portfolio (rather than the transaction id alone) is what keeps one user from
 * touching another's transaction by id — call `requirePortfolio` first.
 */
export async function requireTransaction(
  client: TransactionLookupClient,
  transactionId: string,
  portfolioId: string,
): Promise<Transaction> {
  const transaction = await client.transaction.findFirst({ where: { id: transactionId, portfolioId } });
  if (!transaction) throw new HttpError(404, "Transaction not found");
  return transaction;
}
