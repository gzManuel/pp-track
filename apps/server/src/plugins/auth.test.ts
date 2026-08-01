import { beforeAll, afterAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// env.ts parses process.env at import time — provide the required vars before
// the auth plugin (which imports env) is loaded.
const SECRET = "test-secret-value";
process.env.INTERNAL_API_SECRET = SECRET;
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const VALID_USER_ID = "3f1e9a3c-64c9-4d7e-9c6a-2b8f0f6f9d11";

describe("auth plugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { default: authPlugin } = await import("./auth.js");
    app = Fastify();
    await app.register(authPlugin);
    app.get("/secret-only", { onRequest: app.verifyInternalSecret }, async () => ({ ok: true }));
    app.get("/user-scoped", { onRequest: app.authenticate }, async (request) => ({ userId: request.userId }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  function inject(url: string, headers: Record<string, string>) {
    return app.inject({ method: "GET", url, headers });
  }

  describe("verifyInternalSecret", () => {
    it("should return 401 with no secret header", async () => {
      const res = await inject("/secret-only", {});
      expect(res.statusCode).toBe(401);
    });

    it("should return 401 with a wrong secret of the same length", async () => {
      const res = await inject("/secret-only", { "x-internal-secret": "x".repeat(SECRET.length) });
      expect(res.statusCode).toBe(401);
    });

    it("should return 401 with a wrong-length secret (timingSafeEqual guard)", async () => {
      const res = await inject("/secret-only", { "x-internal-secret": "short" });
      expect(res.statusCode).toBe(401);
    });

    it("should return 401 with an empty secret even though the env var is set", async () => {
      const res = await inject("/secret-only", { "x-internal-secret": "" });
      expect(res.statusCode).toBe(401);
    });

    it("should pass with the correct secret", async () => {
      const res = await inject("/secret-only", { "x-internal-secret": SECRET });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });
  });

  describe("authenticate", () => {
    it("should return 401 with a valid secret but no user id", async () => {
      const res = await inject("/user-scoped", { "x-internal-secret": SECRET });
      expect(res.statusCode).toBe(401);
    });

    it("should return 401 with a malformed (non-UUID) user id", async () => {
      const res = await inject("/user-scoped", { "x-internal-secret": SECRET, "x-user-id": "not-a-uuid" });
      expect(res.statusCode).toBe(401);
    });

    it("should return 401 with a valid user id but wrong secret", async () => {
      const res = await inject("/user-scoped", { "x-internal-secret": "nope", "x-user-id": VALID_USER_ID });
      expect(res.statusCode).toBe(401);
    });

    it("should populate request.userId on success", async () => {
      const res = await inject("/user-scoped", { "x-internal-secret": SECRET, "x-user-id": VALID_USER_ID });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ userId: VALID_USER_ID });
    });
  });
});
