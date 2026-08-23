import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { buildApp } from "../app.js";
import { asPrismaClient, createStubPrisma, dec, type StubPrisma } from "../test-support/stub-prisma.js";
import {
  auth,
  ASSET_ID,
  OTHER_USER_ID,
  PORTFOLIO_ID,
  portfolioRow,
  SECRET,
  USER_ID,
  type ErrorBody,
  type HoldingBody,
} from "../test-support/fixtures.js";

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
    // Every portfolio route must be behind `app.authenticate`. Table-driven so
    // a newly added route without the guard is a one-line test failure.
    const routes = [
      { method: "GET" as const, url: `/api/portfolios` },
      { method: "POST" as const, url: `/api/portfolios` },
      { method: "GET" as const, url: `/api/portfolios/${PORTFOLIO_ID}/holdings` },
    ];

    it.each(routes)("should return 401 $method $url without credentials", async ({ method, url }) => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
      expect(prisma.portfolio.findFirst).not.toHaveBeenCalled();
    });

    it.each(routes)("should return 401 $method $url with a valid secret but no user id", async ({ method, url }) => {
      const res = await app.inject({ method, url, headers: { "x-internal-secret": SECRET } });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /portfolios", () => {
    it("should return only the caller's portfolios, defaults first", async () => {
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
    it("should create the first portfolio as the default", async () => {
      prisma.portfolio.count.mockResolvedValue(0);
      prisma.portfolio.create.mockResolvedValue(portfolioRow);

      const res = await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "Main" } });

      expect(res.statusCode).toBe(201);
      expect(prisma.portfolio.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, name: "Main", isDefault: true },
      });
    });

    it("should not mark a subsequent portfolio as the default", async () => {
      prisma.portfolio.count.mockResolvedValue(2);
      prisma.portfolio.create.mockResolvedValue({ ...portfolioRow, isDefault: false });

      await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "Second" } });

      expect(prisma.portfolio.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, name: "Second", isDefault: false },
      });
    });

    it("should return 400 on an empty name without touching the database", async () => {
      const res = await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "" } });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().error).toBe("Validation failed");
      expect(prisma.portfolio.create).not.toHaveBeenCalled();
    });

    // count + create run at Serializable isolation so two concurrent "first
    // portfolio" requests can't both win the default flag. The loser aborts with
    // P2034 and must be retried, not surfaced to the caller.
    it("should retry once when the serializable transaction aborts", async () => {
      const abort = new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict", {
        code: "P2034",
        clientVersion: "7.0.0",
      });
      prisma.portfolio.count.mockRejectedValueOnce(abort).mockResolvedValue(1);
      prisma.portfolio.create.mockResolvedValue({ ...portfolioRow, isDefault: false });

      const res = await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "Main" } });

      expect(res.statusCode).toBe(201);
      expect(prisma.portfolio.count).toHaveBeenCalledTimes(2);
      // The rerun sees the winner's row, so this one is no longer the default.
      expect(prisma.portfolio.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, name: "Main", isDefault: false },
      });
    });

    it("should not retry an error that is not a write conflict", async () => {
      const other = new Prisma.PrismaClientKnownRequestError("Timed out fetching a connection", {
        code: "P2024",
        clientVersion: "7.0.0",
      });
      prisma.portfolio.count.mockRejectedValue(other);

      const res = await app.inject({ method: "POST", url: "/api/portfolios", headers: auth, payload: { name: "Main" } });

      expect(res.statusCode).toBe(500);
      expect(prisma.portfolio.count).toHaveBeenCalledTimes(1);
      expect(prisma.portfolio.create).not.toHaveBeenCalled();
    });
  });

  describe("GET /portfolios/:id/holdings", () => {
    it("should return 404 when the portfolio belongs to another user", async () => {
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

    it("should serialize Decimal columns as strings", async () => {
      prisma.portfolio.findFirst.mockResolvedValue(portfolioRow);
      prisma.holding.findMany.mockResolvedValue([
        {
          id: "e14f3b5d-c077-4f4e-b258-6d8a9f0b1c23",
          portfolioId: PORTFOLIO_ID,
          assetId: ASSET_ID,
          quantity: dec("10.50000000"),
          avgCostBasis: dec("183.33333333"),
          avgCostBasisArs: dec("275000.00000000"),
          avgCostBasisCcl: dec("171.87500000"),
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
      // All three bases are carried at full precision, not just the MEP one.
      expect(holding?.avgCostBasisArs).toBe("275000");
      expect(holding?.avgCostBasisCcl).toBe("171.875");
    });

    it("should return 400 on a non-UUID portfolio id", async () => {
      const res = await app.inject({ method: "GET", url: "/api/portfolios/not-a-uuid/holdings", headers: auth });

      expect(res.statusCode).toBe(400);
      expect(prisma.portfolio.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("cross-user isolation", () => {
    it("should scope every ownership lookup to the calling user", async () => {
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
