import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { asPrismaClient, createStubPrisma, type StubPrisma } from "../test-support/stub-prisma.js";
import { SECRET, USER_ID } from "../test-support/fixtures.js";

describe("users routes", () => {
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
    it("should return 401 without internal secret", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        payload: { email: "test@example.com", name: "Test User" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("should return 401 with wrong internal secret", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        headers: { "x-internal-secret": "wrong-secret" },
        payload: { email: "test@example.com", name: "Test User" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /users/upsert", () => {
    it("should create a new user with all fields", async () => {
      const user = {
        id: USER_ID,
        email: "newuser@example.com",
        name: "New User",
        image: "https://example.com/avatar.jpg",
      };

      prisma.user.upsert.mockResolvedValue(user);

      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        headers: { "x-internal-secret": SECRET },
        payload: { email: "newuser@example.com", name: "New User", image: "https://example.com/avatar.jpg" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(user);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn().mock is untyped
      const call = prisma.user.upsert.mock.calls[0]![0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.where.email).toBe("newuser@example.com");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.create).toMatchObject({
        email: "newuser@example.com",
        name: "New User",
        image: "https://example.com/avatar.jpg",
      });
    });

    it("should default empty name to empty string", async () => {
      const user = {
        id: USER_ID,
        email: "user@example.com",
        name: "",
        image: null,
      };

      prisma.user.upsert.mockResolvedValue(user);

      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        headers: { "x-internal-secret": SECRET },
        payload: { email: "user@example.com" },
      });

      expect(res.statusCode).toBe(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn().mock is untyped
      const call = prisma.user.upsert.mock.calls[0]![0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.create.name).toBe("");
    });

    it("should update only provided fields on existing user", async () => {
      const user = {
        id: USER_ID,
        email: "existing@example.com",
        name: "Updated Name",
        image: "https://example.com/new-avatar.jpg",
      };

      prisma.user.upsert.mockResolvedValue(user);

      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        headers: { "x-internal-secret": SECRET },
        payload: { email: "existing@example.com", name: "Updated Name", image: "https://example.com/new-avatar.jpg" },
      });

      expect(res.statusCode).toBe(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn().mock is untyped
      const call = prisma.user.upsert.mock.calls[0]![0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.update).toMatchObject({
        name: "Updated Name",
        image: "https://example.com/new-avatar.jpg",
      });
    });

    it("should skip updating name if not provided", async () => {
      const user = {
        id: USER_ID,
        email: "user@example.com",
        name: "Existing Name",
        image: null,
      };

      prisma.user.upsert.mockResolvedValue(user);

      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        headers: { "x-internal-secret": SECRET },
        payload: { email: "user@example.com" },
      });

      expect(res.statusCode).toBe(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn().mock is untyped
      const call = prisma.user.upsert.mock.calls[0]![0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- call is untyped
      expect(call.update).toEqual({});
    });

    it("should reject missing email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        headers: { "x-internal-secret": SECRET },
        payload: { name: "Test User" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/users/upsert",
        headers: { "x-internal-secret": SECRET },
        payload: { email: "not-an-email", name: "Test User" },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
