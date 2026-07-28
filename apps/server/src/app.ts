import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { PrismaClient } from "@prisma/client";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
// `env` transitively loads dotenv, so it must stay the first project import.
import { env } from "./env.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import pricesRoutes from "./routes/prices.js";
import usersRoutes from "./routes/users.js";
import portfoliosRoutes from "./routes/portfolios.js";
import assetsRoutes from "./routes/assets.js";

export interface BuildAppOptions {
  /**
   * Prisma client to use instead of the one the plugin would construct. Tests
   * pass a stub/throwaway client; production leaves this unset. A caller-owned
   * client is not disconnected on shutdown — whoever created it owns it.
   */
  prisma?: PrismaClient;
  /** Overrides the default logger config (tests pass `false` to silence it). */
  logger?: boolean;
}

/**
 * Builds the fully-wired Fastify instance without listening on a port.
 *
 * Kept separate from `index.ts` so tests can construct the real app — every
 * plugin, hook, schema and error path included — and drive it through
 * `app.inject()` with no network or database.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? {
      level: env.LOG_LEVEL,
      // Auth material must never land in logs, even if request logging gets
      // more verbose later.
      redact: ["req.headers['x-internal-secret']", "req.headers['x-user-id']"],
    },
    // Trust the caller's request id (the web app sends one per request) so a
    // user-facing failure can be correlated across both apps' logs.
    requestIdHeader: "x-request-id",
  });

  // #1 — Teach Fastify to validate/serialize using Zod schemas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Central error policy: schema validation failures are the client's fault (400),
  // errors that carry an intentional status code pass through, and everything else
  // (Prisma failures, bugs) is logged server-side and returned as an opaque 500 so
  // internal details (model/constraint names, connection strings) never leak.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: "Validation failed",
        issues: error.validation.map((issue: { instancePath: string; message?: string }) => ({
          path: issue.instancePath,
          message: issue.message ?? "Invalid value",
        })),
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error(error, "response failed serialization schema");
      return reply.status(500).send({ error: "Internal Server Error" });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) {
      return reply.status(statusCode).send({ error: error.message });
    }

    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error" });
  });

  // #2/#3 — Register cross-cutting plugins before the routes that use them.
  // Global rate limit is a generous backstop; hot/expensive routes override it
  // with tighter per-route configs.
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(prismaPlugin, { client: options.prisma });
  await app.register(authPlugin);

  await app.register(pricesRoutes, { prefix: "/api" });
  await app.register(usersRoutes, { prefix: "/api" });
  await app.register(portfoliosRoutes, { prefix: "/api" });
  await app.register(assetsRoutes, { prefix: "/api" });

  // Unauthenticated and it touches the DB — keep the limit tight.
  app.get("/health", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (error) {
      // Log the real failure; the public response stays generic so DB connection
      // details never reach unauthenticated callers.
      request.log.error(error, "health check failed");
      return reply.status(503).send({ status: "error" });
    }
  });

  return app;
}
