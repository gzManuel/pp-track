import { describe, it, expect, vi } from "vitest";
import { requirePortfolio, requireTransaction, type PortfolioClient, type TransactionLookupClient } from "./authorization.js";
import { HttpError } from "../http-error.js";

describe("authorization", () => {
  describe("requirePortfolio", () => {
    it("should resolve when portfolio exists and belongs to user", async () => {
      const portfolio = { id: "p1", userId: "u1", name: "Main", createdAt: new Date() };
      const mockClient = {
        portfolio: {
          findFirst: vi.fn().mockResolvedValue(portfolio),
        },
      };

      const result = await requirePortfolio(mockClient as unknown as PortfolioClient, "p1", "u1");

      expect(result).toEqual(portfolio);
      expect(mockClient.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: "p1", userId: "u1" },
      });
    });

    it("should throw 404 when portfolio does not exist", async () => {
      const mockClient = {
        portfolio: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(requirePortfolio(mockClient as unknown as PortfolioClient, "p1", "u1")).rejects.toThrow(HttpError);
      try {
        await requirePortfolio(mockClient as unknown as PortfolioClient, "p1", "u1");
      } catch (e) {
        expect(e).toBeInstanceOf(HttpError);
        expect((e as HttpError).statusCode).toBe(404);
        expect((e as HttpError).message).toBe("Portfolio not found");
      }
    });

    it("should honor custom notFoundMessage", async () => {
      const mockClient = {
        portfolio: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      try {
        await requirePortfolio(mockClient as unknown as PortfolioClient, "p1", "u1", "Custom message");
      } catch (e) {
        expect((e as HttpError).statusCode).toBe(404);
        expect((e as HttpError).message).toBe("Custom message");
      }
    });

    it("should scope lookup by both id and userId in where clause", async () => {
      const mockClient = {
        portfolio: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(requirePortfolio(mockClient as unknown as PortfolioClient, "p1", "u1")).rejects.toThrow();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn().mock is untyped
      const call = mockClient.portfolio.findFirst.mock.calls[0]![0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.where.id).toBe("p1");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.where.userId).toBe("u1");
    });
  });

  describe("requireTransaction", () => {
    it("should resolve when transaction exists under portfolio", async () => {
      const transaction = {
        id: "tx1",
        portfolioId: "p1",
        type: "BUY",
        ticker: "AAPL",
        quantity: "10",
        price: "150",
        currency: "USD",
        transactedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockClient = {
        transaction: {
          findFirst: vi.fn().mockResolvedValue(transaction),
        },
      };

      const result = await requireTransaction(mockClient as unknown as TransactionLookupClient, "tx1", "p1");

      expect(result).toEqual(transaction);
      expect(mockClient.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: "tx1", portfolioId: "p1" },
      });
    });

    it("should throw 404 when transaction does not exist", async () => {
      const mockClient = {
        transaction: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(requireTransaction(mockClient as unknown as TransactionLookupClient, "tx1", "p1")).rejects.toThrow(HttpError);
      try {
        await requireTransaction(mockClient as unknown as TransactionLookupClient, "tx1", "p1");
      } catch (e) {
        expect((e as HttpError).statusCode).toBe(404);
        expect((e as HttpError).message).toBe("Transaction not found");
      }
    });

    it("should scope lookup by both id and portfolioId for security", async () => {
      const mockClient = {
        transaction: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(requireTransaction(mockClient as unknown as TransactionLookupClient, "tx1", "p1")).rejects.toThrow();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn().mock is untyped
      const call = mockClient.transaction.findFirst.mock.calls[0]![0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.where.id).toBe("tx1");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.where.portfolioId).toBe("p1");
    });
  });
});
