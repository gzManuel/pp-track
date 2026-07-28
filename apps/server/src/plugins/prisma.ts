import fp from "fastify-plugin";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../prisma-client.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export interface PrismaPluginOptions {
  /**
   * Use this client instead of constructing one. Tests inject a stub; leaving
   * it unset is the production path.
   */
  client?: PrismaClient;
}

/**
 * Decorates the Fastify instance with a shared Prisma client (`app.prisma`).
 * Wrapped in `fastify-plugin` so the decorator escapes encapsulation and is
 * visible to every route.
 *
 * Only a client this plugin created is disconnected on shutdown — an injected
 * one belongs to its caller, who may still need it after the app closes.
 */
export default fp<PrismaPluginOptions>(async (app, options) => {
  const owned = options.client === undefined;
  const prisma = options.client ?? createPrismaClient();

  app.decorate("prisma", prisma);

  if (owned) {
    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  }
});
