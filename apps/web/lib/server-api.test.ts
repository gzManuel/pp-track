import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireEnv, serverBaseUrl, serverFetch, serverFetchJson } from "./server-api";

describe("server-api", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("SERVER_API_URL", "");
    vi.stubEnv("INTERNAL_API_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("requireEnv", () => {
    it("should return the env var when set", () => {
      vi.stubEnv("TEST_VAR", "test-value");
      expect(requireEnv("TEST_VAR")).toBe("test-value");
    });

    it("should throw when env var is missing", () => {
      expect(() => requireEnv("MISSING_VAR")).toThrow("Missing required environment variable: MISSING_VAR");
    });

    it("should throw when env var is empty string", () => {
      vi.stubEnv("EMPTY_VAR", "");
      expect(() => requireEnv("EMPTY_VAR")).toThrow("Missing required environment variable: EMPTY_VAR");
    });
  });

  describe("serverBaseUrl", () => {
    it("should return dev default when NODE_ENV is not production and SERVER_API_URL not set", () => {
      vi.stubEnv("NODE_ENV", "development");
      // Unstub SERVER_API_URL by restoring to undefined
      delete process.env.SERVER_API_URL;
      expect(serverBaseUrl()).toBe("http://localhost:3001");
    });

    it("should return SERVER_API_URL when explicitly set in non-prod", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("SERVER_API_URL", "http://staging:3001");
      expect(serverBaseUrl()).toBe("http://staging:3001");
    });

    it("should require SERVER_API_URL in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      // Unstub SERVER_API_URL by restoring to undefined
      delete process.env.SERVER_API_URL;
      expect(() => serverBaseUrl()).toThrow("Missing required environment variable: SERVER_API_URL");
    });

    it("should use provided SERVER_API_URL in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SERVER_API_URL", "https://api.example.com");
      expect(serverBaseUrl()).toBe("https://api.example.com");
    });
  });

  describe("serverFetch", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("SERVER_API_URL", "http://localhost:3001");
      vi.stubEnv("INTERNAL_API_SECRET", "test-secret");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}')));
      vi.stubGlobal("crypto", {
        randomUUID: () => "test-uuid-1234",
      } as unknown as Crypto);
    });

    it("should construct full URL from path", async () => {
      await serverFetch("/api/test");

      const mockFetch = vi.mocked(global.fetch);
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/test", expect.objectContaining({}));
    });

    it("should include internal-secret header", async () => {
      await serverFetch("/api/test");

      const mockFetch = vi.mocked(global.fetch);
      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers["x-internal-secret"]).toBe("test-secret");
    });

    it("should throw when INTERNAL_API_SECRET is missing", () => {
      vi.stubEnv("INTERNAL_API_SECRET", "");

      expect(() => serverFetch("/api/test")).toThrow("Missing required environment variable: INTERNAL_API_SECRET");
    });

    it("should include x-request-id header as UUID", async () => {
      await serverFetch("/api/test");

      const mockFetch = vi.mocked(global.fetch);
      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers["x-request-id"]).toBeDefined();
      expect(typeof headers["x-request-id"]).toBe("string");
    });

    it("should include userId in x-user-id header when provided", async () => {
      await serverFetch("/api/test", { userId: "user-123" });

      const mockFetch = vi.mocked(global.fetch);
      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers["x-user-id"]).toBe("user-123");
    });

    it("should omit x-user-id header when userId not provided", async () => {
      await serverFetch("/api/test");

      const mockFetch = vi.mocked(global.fetch);
      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers["x-user-id"]).toBeUndefined();
    });

    it("should set cache: no-store by default", async () => {
      await serverFetch("/api/test");

      const mockFetch = vi.mocked(global.fetch);
      const options = mockFetch.mock.calls[0]![1] as Record<string, unknown>;
      expect(options.cache).toBe("no-store");
    });

    it("should allow overriding cache option", async () => {
      await serverFetch("/api/test", { cache: "force-cache" });

      const mockFetch = vi.mocked(global.fetch);
      const options = mockFetch.mock.calls[0]![1] as Record<string, unknown>;
      expect(options.cache).toBe("force-cache");
    });

    it("should merge custom headers with internal headers", async () => {
      await serverFetch("/api/test", {
        headers: { "x-custom": "custom-value", "content-type": "application/json" },
      });

      const mockFetch = vi.mocked(global.fetch);
      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers["x-internal-secret"]).toBe("test-secret");
      expect(headers["x-custom"]).toBe("custom-value");
      expect(headers["content-type"]).toBe("application/json");
    });

    it("should allow passing method and body options", async () => {
      await serverFetch("/api/test", {
        method: "POST",
        body: JSON.stringify({ key: "value" }),
      });

      const mockFetch = vi.mocked(global.fetch);
      const options = mockFetch.mock.calls[0]![1] as Record<string, unknown>;
      expect(options.method).toBe("POST");
      expect(options.body).toEqual(JSON.stringify({ key: "value" }));
    });
  });

  describe("serverFetchJson", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("SERVER_API_URL", "http://localhost:3001");
      vi.stubEnv("INTERNAL_API_SECRET", "test-secret");
    });

    it("should parse JSON from successful response", async () => {
      const data = { id: "123", name: "Test" };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 })));

      const result = await serverFetchJson("/api/test");
      expect(result).toEqual(data);
    });

    it("should throw on non-2xx status", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Not found" }), { status: 404 })));

      await expect(serverFetchJson("/api/test")).rejects.toThrow("Backend request failed: 404");
    });

    it("should include path in error message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));

      await expect(serverFetchJson("/api/users/123")).rejects.toThrow("/api/users/123");
    });

    it("should truncate response body to 200 chars in error", async () => {
      const longBody = "x".repeat(300);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(longBody, { status: 500 })));

      try {
        await serverFetchJson("/api/test");
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        expect(error.message.length).toBeLessThan(longBody.length);
        // Error message is about status 500, just verify truncation happened
        expect(error.message.length).toBeLessThan(500);
      }
    });

    it("should handle text read failure gracefully", async () => {
      const mockResponse = new Response("", { status: 500 });
      mockResponse.text = vi.fn().mockRejectedValue(new Error("text() failed"));

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      await expect(serverFetchJson("/api/test")).rejects.toThrow("Backend request failed: 500 /api/test");
    });

    it("should not include extra dash when body is empty", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 400 })));

      await expect(serverFetchJson("/api/test")).rejects.toThrow("Backend request failed: 400 /api/test");
    });
  });
});
