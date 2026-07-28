import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { asPrismaClient, createStubPrisma, dec, type StubPrisma } from "../test-support/stub-prisma.js";
import {
  auth,
  assetRow,
  OTHER_PORTFOLIO_ID,
  PORTFOLIO_ID,
  portfolioRow,
  SECRET,
  transactionRow,
  TX_ID,
  validTransactionBody,
  type ErrorBody,
  type TransactionPageBody,
} from "../test-support/fixtures.js";

// The asset-resolution path reaches the network; route tests care about the
// HTTP layer, so keep Yahoo and the MEP feed out of it entirely.
vi.mock("../services/yahoo-finance.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/yahoo-finance.js")>()),
  fetchQuote: vi.fn(async () => ({
    symbol: "AAPL",
    price: 100,
    currency: "USD",
    name: "Apple Inc.",
    quoteType: "EQUITY",
    exchange: "NMS",
  })),
}));

describe("transaction routes", () => {
  let app: FastifyInstance;
  let prisma: StubPrisma;

  beforeEach(async () => {
    prisma = createStubPrisma();
    app = await buildApp({ prisma: asPrismaClient(prisma), logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("authentication", () => {
    // Every transaction route must be behind `app.authenticate`. Table-driven so
    // a newly added route without the guard is a one-line test failure.
    const routes = [
      { method: "GET" as const, url: `/api/portfolios/${PORTFOLIO_ID}/transactions` },
      { method: "POST" as const, url: `/api/portfolios/${PORTFOLIO_ID}/transactions` },
      { method: "PATCH" as const, url: `/api/portfolios/${PORTFOLIO_ID}/transactions/${TX_ID}` },
      { method: "DELETE" as const, url: `/api/portfolios/${PORTFOLIO_ID}/transactions/${TX_ID}` },
    ];

    it.each(routes)("401s $method $url without credentials", async ({ method, url }) => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
      expect(prisma.portfolio.findFirst).not.toHaveBeenCalled();
    });

    it.each(routes)("401s $method $url with a valid secret but no user id", async ({ method, url }) => {
      const res = await app.inject({ method, url, headers: { "x-internal-secret": SECRET } });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /portfolios/:id/transactions", () => {
    beforeEach(() => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
    });

    it("returns a null cursor when the page is not full", async () => {
      prisma.transaction.findMany.mockResolvedValue([transactionRow()]);

      const res = await app.inject({
        method: "GET",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions?take=2`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<TransactionPageBody>().nextCursor).toBeNull();
      expect(res.json<TransactionPageBody>().items).toHaveLength(1);
    });

    it("trims the lookahead row and returns its predecessor as the cursor", async () => {
      const first = transactionRow({ id: TX_ID });
      const second = transactionRow({ id: "aa1b2c3d-4e5f-4061-8273-849a5b6c7d8e" });
      const lookahead = transactionRow({ id: "bb2c3d4e-5f60-4172-9384-95ab6c7d8e9f" });
      prisma.transaction.findMany.mockResolvedValue([first, second, lookahead]);

      const res = await app.inject({
        method: "GET",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions?take=2`,
        headers: auth,
      });

      const body = res.json<TransactionPageBody>();
      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toBe(second.id);
      // take + 1 is what makes "is there another page?" answerable in one query.
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    });

    it("skips the cursor row itself when paging", async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await app.inject({
        method: "GET",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions?take=2&cursor=${TX_ID}`,
        headers: auth,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: TX_ID }, skip: 1 }));
    });

    it("400s on a take above the cap", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions?take=5000`,
        headers: auth,
      });

      expect(res.statusCode).toBe(400);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /portfolios/:id/transactions", () => {
    it("404s before doing any asset resolution when the portfolio isn't the caller's", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions`,
        headers: auth,
        payload: validTransactionBody,
      });

      expect(res.statusCode).toBe(404);
      expect(prisma.asset.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it("creates the transaction and rebuilds the holding", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.asset.findFirst.mockResolvedValue(assetRow);
      prisma.transaction.create.mockResolvedValue(transactionRow());
      prisma.transaction.findMany.mockResolvedValue([transactionRow()]);
      prisma.holding.findUnique.mockResolvedValue(null);
      prisma.holding.create.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions`,
        headers: auth,
        payload: validTransactionBody,
      });

      expect(res.statusCode).toBe(201);
      // The holding row is rebuilt in the same interactive transaction.
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.holding.create).toHaveBeenCalled();
    });

    it("lowercases types are normalized before reaching the database", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.asset.findFirst.mockResolvedValue(assetRow);
      prisma.transaction.create.mockResolvedValue(transactionRow({ type: "DIVIDEND" }));

      await app.inject({
        method: "POST",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions`,
        headers: auth,
        payload: { ...validTransactionBody, type: "dividend" },
      });

      const [createArgs] = prisma.transaction.create.mock.calls[0] as [{ data: { type: string } }];
      expect(createArgs.data.type).toBe("DIVIDEND");
    });

    it("leaves the holding untouched for a DIVIDEND", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.asset.findFirst.mockResolvedValue(assetRow);
      prisma.transaction.create.mockResolvedValue(transactionRow({ type: "DIVIDEND" }));

      await app.inject({
        method: "POST",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions`,
        headers: auth,
        payload: { ...validTransactionBody, type: "DIVIDEND" },
      });

      expect(prisma.holding.create).not.toHaveBeenCalled();
      expect(prisma.holding.update).not.toHaveBeenCalled();
    });

    it("422s when a SELL exceeds the position held at that date", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.asset.findFirst.mockResolvedValue(assetRow);
      const sell = transactionRow({ type: "SELL", quantity: dec("999") });
      prisma.transaction.create.mockResolvedValue(sell);
      // Only the oversized SELL exists — nothing was ever bought.
      prisma.transaction.findMany.mockResolvedValue([sell]);
      prisma.holding.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions`,
        headers: auth,
        payload: { ...validTransactionBody, type: "SELL", quantity: 999 },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json<ErrorBody>()).toEqual({ error: "Cannot sell more than the quantity held at that date" });
    });

    it("400s on a negative quantity", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);

      const res = await app.inject({
        method: "POST",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions`,
        headers: auth,
        payload: { ...validTransactionBody, quantity: -5 },
      });

      expect(res.statusCode).toBe(400);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /portfolios/:id/transactions/:txId", () => {
    it("404s when the transaction isn't in the given portfolio", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.transaction.findFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions/${TX_ID}`,
        headers: auth,
        payload: validTransactionBody,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorBody>()).toEqual({ error: "Transaction not found" });
      expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: TX_ID, portfolioId: PORTFOLIO_ID },
      });
    });

    it("404s with a distinct message when the move target isn't the caller's", async () => {
      // Call order: the owning portfolio resolves, then the move target doesn't.
      prisma.portfolio.findFirst.mockResolvedValueOnce(portfolioRow).mockResolvedValueOnce(null);
      prisma.transaction.findFirst.mockResolvedValue(transactionRow());

      const res = await app.inject({
        method: "PATCH",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions/${TX_ID}`,
        headers: auth,
        payload: { ...validTransactionBody, portfolioId: OTHER_PORTFOLIO_ID },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorBody>()).toEqual({ error: "Target portfolio not found" });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /portfolios/:id/transactions/:txId", () => {
    it("deletes and returns 204", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.transaction.findFirst.mockResolvedValue(transactionRow());
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.holding.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions/${TX_ID}`,
        headers: auth,
      });

      expect(res.statusCode).toBe(204);
      expect(prisma.transaction.delete).toHaveBeenCalledWith({ where: { id: TX_ID } });
    });

    it("404s without deleting when the portfolio isn't the caller's", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions/${TX_ID}`,
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
      expect(prisma.transaction.delete).not.toHaveBeenCalled();
    });
  });
});
