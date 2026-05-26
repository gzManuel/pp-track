import "dotenv/config";
import Fastify from "fastify";
import prisma from "./prisma.js";
import { pricesRoutes } from "./routes/prices.js";

const app = Fastify({ logger: true });

app.register(pricesRoutes, { prefix: "/api" });

app.get("/health", async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", database: "connected" };
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit();
});

await app.listen({ port: 3001, host: "0.0.0.0" });

