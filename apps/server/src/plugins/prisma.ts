import fp from "fastify-plugin";
import type { PrismaClient } from "@prisma/client";
import prisma from "../prisma";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/**
 * Decorates the Fastify instance with a shared Prisma client (`app.prisma`)
 * and disconnects it on shutdown. Wrapped in `fastify-plugin` so the
 * decorator escapes encapsulation and is visible to every route.
 */
export default fp(async (app) => {
  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});
