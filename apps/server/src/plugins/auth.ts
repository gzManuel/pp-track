import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env";

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler that validates the internal secret + user header. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler that validates only the internal secret (non-user-scoped routes). */
    verifyInternalSecret: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** The authenticated user id, populated by `authenticate`. */
    userId: string;
  }
}

/**
 * Constant-ish check that the request carries the shared internal secret.
 * Requires a non-empty string header so it fails closed even if the env var were
 * somehow unset (startup validation in `env.ts` already guarantees it is set).
 */
function hasValidSecret(request: FastifyRequest): boolean {
  const secret = request.headers["x-internal-secret"];
  return typeof secret === "string" && secret.length > 0 && secret === env.INTERNAL_API_SECRET;
}

/**
 * Registers two preHandlers:
 * - `verifyInternalSecret` guards shared, non-user-scoped routes (e.g. `/prices`).
 * - `authenticate` additionally requires an `x-user-id` and populates
 *   `request.userId`. Both reply 401 and skip the route handler on failure.
 */
export default fp(async (app) => {
  app.decorateRequest("userId", "");

  app.decorate("verifyInternalSecret", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!hasValidSecret(request)) {
      reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const rawUserId = request.headers["x-user-id"];
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

    if (!hasValidSecret(request) || !userId) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    request.userId = userId;
  });
});
