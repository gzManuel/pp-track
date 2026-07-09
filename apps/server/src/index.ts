import "dotenv/config";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import pricesRoutes from "./routes/prices.js";
import usersRoutes from "./routes/users.js";
import portfoliosRoutes from "./routes/portfolios.js";
import assetsRoutes from "./routes/assets.js";

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
app.register(assetsRoutes, { prefix: "/api" });

app.get("/health", async () => {
  try {
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", database: "connected" };
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
});

process.on("SIGINT", () => {
  // app.close() fires the onClose hook that disconnects Prisma.
  void app.close().finally(() => {
    process.exit();
  });
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
await app.listen({ port, host });
