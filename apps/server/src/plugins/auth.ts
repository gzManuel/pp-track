import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler that validates the internal secret + user header. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** The authenticated user id, populated by `authenticate`. */
    userId: string;
  }
}

/**
 * Registers an `authenticate` preHandler. On success it populates
 * `request.userId`; otherwise it replies 401 and the route handler is skipped.
 */
export default fp(async (app) => {
  app.decorateRequest("userId", "");

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const secret = request.headers["x-internal-secret"];
      const rawUserId = request.headers["x-user-id"];
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

      if (secret !== process.env.INTERNAL_API_SECRET || !userId) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      request.userId = userId;
    }
  );
});
