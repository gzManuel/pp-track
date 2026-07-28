import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { asPrismaClient, createStubPrisma, dec, type StubPrisma } from "../test-support/stub-prisma.js";

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

const SECRET = "test-secret-value";
const USER_ID = "3f1e9a3c-64c9-4d7e-9c6a-2b8f0f6f9d11";
const OTHER_USER_ID = "8c2d5b71-1f3a-4e60-9a2b-77c0d1e4f5a6";
const PORTFOLIO_ID = "b81c0e2a-9d44-4c1b-8f2e-3a5d6c7b8e90";
const TX_ID = "c92d1f3b-ae55-4d2c-9036-4b6e7d8c9f01";
const ASSET_ID = "d03e2a4c-bf66-4e3d-a147-5c7f8e9d0a12";

const auth = { "x-internal-secret": SECRET, "x-user-id": USER_ID };

const portfolioRow = {
  id: PORTFOLIO_ID,
  userId: USER_ID,
  name: "Main",
  description: null,
  currency: "USD",
  isDefault: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const assetRow = {
  id: ASSET_ID,
  ticker: "AAPL",
  name: "Apple Inc.",
  assetType: "EQUITY",
  exchange: "NMS",
  currency: "USD",
  metadata: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TX_ID,
    portfolioId: PORTFOLIO_ID,
    assetId: ASSET_ID,
    type: "BUY",
    quantity: dec("10"),
    price: dec("100"),
    fee: dec("0"),
    currency: "USD",
    transactedAt: new Date("2026-01-15T12:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
    asset: { ticker: "AAPL", name: "Apple Inc." },
    ...overrides,
  };
}

const validBody = {
  ticker: "AAPL",
  type: "BUY",
  quantity: 10,
  price: 100,
  currency: "USD",
  transactedAt: "2026-01-15",
};

// `inject().json()` is `any`; these name the shape each assertion expects so the
// tests stay type-checked under the app's strict lint rules.
interface ErrorBody {
  error: string;
}
interface HoldingBody {
  quantity: string;
  avgCostBasis: string;
}
interface TransactionPage {
  items: { id: string }[];
  nextCursor: string | null;
}

describe("portfolio routes", () => {
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
    // Every user-scoped route must be behind `app.authenticate`. Table-driven so
    // a newly added route without the guard is a one-line test failure.
    const routes = [
      { method: "GET" as const, url: `/api/portfolios` },
      { method: "POST" as const, url: `/api/portfolios` },
      { method: "GET" as const, url: `/api/portfolios/${PORTFOLIO_ID}/holdings` },
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

  describe("GET /portfolios", () => {
    it("returns only the caller's portfolios, defaults first", async () => {
      prisma.portfolio.findMany.mockResolvedValue([portfolioRow]);

      const res = await app.inject({ method: "GET", url: "/api/portfolios", headers: auth });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([expect.objectContaining({ id: PORTFOLIO_ID, name: "Main", isDefault: true })]);
      expect(prisma.portfolio.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
    });
  });

  describe("POST /portfolios", () => {
    it("creates the first portfolio as the default", async () => {
      prisma.portfolio.count.mockResolvedValue(0);
      prisma.portfolio.create.mockResolvedValue(portfolioRow);

      const res = await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "Main" } });

      expect(res.statusCode).toBe(201);
      expect(prisma.portfolio.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, name: "Main", isDefault: true },
      });
    });

    it("does not mark a subsequent portfolio as the default", async () => {
      prisma.portfolio.count.mockResolvedValue(2);
      prisma.portfolio.create.mockResolvedValue({ ...portfolioRow, isDefault: false });

      await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "Second" } });

      expect(prisma.portfolio.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, name: "Second", isDefault: false },
      });
    });

    it("400s on an empty name without touching the database", async () => {
      const res = await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "" } });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().error).toBe("Validation failed");
      expect(prisma.portfolio.create).not.toHaveBeenCalled();
    });
  });

  describe("GET /portfolios/:id/holdings", () => {
    it("404s when the portfolio belongs to another user", async () => {
      // The ownership query is scoped by userId, so another user's row simply
      // doesn't match.
      prisma.portfolio.findFirst.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: `/api/portfolios/${PORTFOLIO_ID}/holdings`, headers: auth });

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorBody>()).toEqual({ error: "Portfolio not found" });
      expect(prisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: PORTFOLIO_ID, userId: USER_ID },
      });
      expect(prisma.holding.findMany).not.toHaveBeenCalled();
    });

    it("serializes Decimal columns as strings", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.holding.findMany.mockResolvedValue([
        {
          id: "e14f3b5d-c077-4f4e-b258-6d8a9f0b1c23",
          portfolioId: PORTFOLIO_ID,
          assetId: ASSET_ID,
          quantity: dec("10.50000000"),
          avgCostBasis: dec("183.33333333"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          asset: { ticker: "AAPL", name: "Apple Inc.", currency: "USD", assetType: "EQUITY" },
        },
      ]);

      const res = await app.inject({ method: "GET", url: `/api/portfolios/${PORTFOLIO_ID}/holdings`, headers: auth });

      expect(res.statusCode).toBe(200);
      const [holding] = res.json<HoldingBody[]>();
      // Full precision preserved — a float round-trip would lose the tail.
      expect(holding?.quantity).toBe("10.5");
      expect(holding?.avgCostBasis).toBe("183.33333333");
    });

    it("400s on a non-UUID portfolio id", async () => {
      const res = await app.inject({ method: "GET", url: "/api/portfolios/not-a-uuid/holdings", headers: auth });

      expect(res.statusCode).toBe(400);
      expect(prisma.portfolio.findFirst).not.toHaveBeenCalled();
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
      expect(res.json<TransactionPage>().nextCursor).toBeNull();
      expect(res.json<TransactionPage>().items).toHaveLength(1);
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

      const body = res.json<TransactionPage>();
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
        payload: validBody,
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
        payload: validBody,
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
        payload: { ...validBody, type: "dividend" },
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
        payload: { ...validBody, type: "DIVIDEND" },
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
        payload: { ...validBody, type: "SELL", quantity: 999 },
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
        payload: { ...validBody, quantity: -5 },
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
        payload: validBody,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorBody>()).toEqual({ error: "Transaction not found" });
      expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: TX_ID, portfolioId: PORTFOLIO_ID },
      });
    });

    it("404s with a distinct message when the move target isn't the caller's", async () => {
      const target = "f25a6b7c-8d90-4e12-a345-6b7c8d9e0f11";
      // Call order: the owning portfolio resolves, then the move target doesn't.
      prisma.portfolio.findFirst.mockResolvedValueOnce(portfolioRow).mockResolvedValueOnce(null);
      prisma.transaction.findFirst.mockResolvedValue(transactionRow());

      const res = await app.inject({
        method: "PATCH",
        url: `/api/portfolios/${PORTFOLIO_ID}/transactions/${TX_ID}`,
        headers: auth,
        payload: { ...validBody, portfolioId: target },
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

  describe("cross-user isolation", () => {
    it("scopes every ownership lookup to the calling user", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(null);

      await app.inject({
        method: "GET",
        url: `/api/portfolios/${PORTFOLIO_ID}/holdings`,
        headers: { "x-internal-secret": SECRET, "x-user-id": OTHER_USER_ID },
      });

      expect(prisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: PORTFOLIO_ID, userId: OTHER_USER_ID },
      });
    });
  });
});
