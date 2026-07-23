import Fastify, { type FastifyError } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
// `env` transitively loads dotenv, so it must stay the first project import.
import { env } from "./env";
import prismaPlugin from "./plugins/prisma";
import authPlugin from "./plugins/auth";
import pricesRoutes from "./routes/prices";
import usersRoutes from "./routes/users";
import portfoliosRoutes from "./routes/portfolios";
import assetsRoutes from "./routes/assets";

const app = Fastify({ logger: true });

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
      issues: error.validation.map((issue) => ({
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
await app.register(prismaPlugin);
await app.register(authPlugin);

app.register(pricesRoutes, { prefix: "/api" });
app.register(usersRoutes, { prefix: "/api" });
app.register(portfoliosRoutes, { prefix: "/api" });
app.register(assetsRoutes, { prefix: "/api" });

app.get("/health", async (request, reply) => {
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

// Graceful shutdown on both Ctrl-C (SIGINT) and supervisor stops (SIGTERM —
// what Docker/systemd/pm2 send). app.close() fires the onClose hook that
// disconnects Prisma.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(() => {
      process.exit();
    });
  });
}

await app.listen({ port: env.PORT, host: env.HOST });
