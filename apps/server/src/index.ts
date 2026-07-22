import "dotenv/config";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
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

await app.listen({ port: env.PORT, host: env.HOST });
