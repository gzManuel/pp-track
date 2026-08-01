import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { asPrismaClient, createStubPrisma, type StubPrisma } from "./test-support/stub-prisma.js";
import { HttpError } from "./http-error.js";

describe("app", () => {
  let app: FastifyInstance;
  let prisma: StubPrisma;

  beforeEach(async () => {
    prisma = createStubPrisma();
    app = await buildApp({ prisma: asPrismaClient(prisma), logger: false });
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("should report ok when the database answers", async () => {
      prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

      const res = await app.inject({ method: "GET", url: "/health" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    });

    it("should return 503 with a generic body when the database is unreachable", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

      const res = await app.inject({ method: "GET", url: "/health" });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ status: "error" });
      // Connection details must never reach an unauthenticated caller.
      expect(res.body).not.toContain("ECONNREFUSED");
      expect(res.body).not.toContain("10.0.0.5");
    });

    it("should need no authentication", async () => {
      prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("error handler", () => {
    it("should forward an HttpError's status and message for client errors", async () => {
      app.get("/boom-422", async () => {
        throw new HttpError(422, "Cannot sell more than the quantity held at that date");
      });
      await app.ready();

      const res = await app.inject({ method: "GET", url: "/boom-422" });

      expect(res.statusCode).toBe(422);
      expect(res.json()).toEqual({ error: "Cannot sell more than the quantity held at that date" });
    });

    it("should hide the message of an unexpected server-side failure", async () => {
      app.get("/boom-500", async () => {
        throw new Error("Invalid `prisma.user.findMany()` invocation: column users.secret_column");
      });
      await app.ready();

      const res = await app.inject({ method: "GET", url: "/boom-500" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal Server Error" });
      expect(res.body).not.toContain("secret_column");
      expect(res.body).not.toContain("prisma");
    });

    it("should treat a 500-coded HttpError as opaque too", async () => {
      app.get("/boom-503", async () => {
        throw new HttpError(503, "upstream pool exhausted at db-primary-1");
      });
      await app.ready();

      const res = await app.inject({ method: "GET", url: "/boom-503" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal Server Error" });
      expect(res.body).not.toContain("db-primary-1");
    });
  });

  describe("prisma plugin lifecycle", () => {
    it("should not disconnect a caller-supplied client", async () => {
      await app.close();
      // The test owns this client; closing the app must not tear it down.
      expect(prisma.$disconnect).not.toHaveBeenCalled();

      // Re-open so the shared afterEach close is a no-op rather than an error.
      app = await buildApp({ prisma: asPrismaClient(prisma), logger: false });
    });
  });
});
