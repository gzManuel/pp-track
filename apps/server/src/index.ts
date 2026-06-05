import "dotenv/config";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import { pricesRoutes } from "./routes/prices.js";
import { usersRoutes } from "./routes/users.js";
import { portfoliosRoutes } from "./routes/portfolios.js";

const app = Fastify({ logger: true });

// #1 — Teach Fastify to validate/serialize using Zod schemas.
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// #2/#3 — Register cross-cutting plugins before the routes that use them.
await app.register(prismaPlugin);
await app.register(authPlugin);

app.register(pricesRoutes, { prefix: "/api" });
app.register(usersRoutes, { prefix: "/api" });
app.register(portfoliosRoutes, { prefix: "/api" });

app.get("/health", async () => {
  try {
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", database: "connected" };
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
});

process.on("SIGINT", async () => {
  // app.close() fires the onClose hook that disconnects Prisma.
  await app.close();
  process.exit();
});

await app.listen({ port: 3001, host: "0.0.0.0" });
