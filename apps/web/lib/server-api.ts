/**
 * Single entry point for talking to the Fastify backend from server-side code
 * (server components, server actions, and NextAuth callbacks).
 *
 * Centralizes three things that were previously copy-pasted across every page
 * and action: resolving the backend base URL, attaching the internal-service
 * auth headers, and failing fast when a required env var is missing.
 */

/**
 * Read a required environment variable, throwing a clear error if it is missing
 * or empty. Prefer this over `process.env.X ?? ""`, which silently substitutes a
 * broken value and turns a config mistake into a confusing downstream failure
 * (a request to the wrong host, a rejected secret).
 *
 * Only used on request-time code paths (serving a request), never at module load
 * or during `next build`, so a secret-less build doesn't trip it.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Base URL of the Fastify backend. Required in production, where a missing
 * SERVER_API_URL is a real misconfiguration that should fail loudly rather than
 * silently hit localhost; falls back to the local dev server otherwise so
 * `pnpm dev` needs no extra configuration.
 */
export function serverBaseUrl(): string {
  if (process.env.NODE_ENV === "production") return requireEnv("SERVER_API_URL");
  return process.env.SERVER_API_URL ?? "http://localhost:3001";
}

export interface ServerFetchOptions extends Omit<RequestInit, "headers"> {
  /** Signed-in user's id, sent as the `x-user-id` header for scoped endpoints. */
  userId?: string;
  /** Extra request headers, merged over the internal-auth headers. */
  headers?: Record<string, string>;
}

/**
 * Fetch a path on the backend's authenticated API. Prefixes the base URL,
 * attaches the internal-service secret (fail-fast if unset) plus an optional
 * user id, and disables caching by default. Extra `headers`/`init` are merged,
 * so callers can still set a `Content-Type`, method, or body.
 *
 * Callers remain responsible for checking `res.ok`: a reachable backend can
 * still return an error status, which this does not treat as a thrown error.
 */
export function serverFetch(path: string, options: ServerFetchOptions = {}): Promise<Response> {
  const { userId, headers, ...init } = options;
  return fetch(`${serverBaseUrl()}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "x-internal-secret": requireEnv("INTERNAL_API_SECRET"),
      ...(userId !== undefined ? { "x-user-id": userId } : {}),
      ...headers,
    },
  });
}
