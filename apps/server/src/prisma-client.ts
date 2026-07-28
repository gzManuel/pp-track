import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

/**
 * Constructs a Prisma client on the `@prisma/adapter-pg` driver adapter.
 *
 * A factory rather than a shared module-level singleton: the server gets its
 * client from the Prisma plugin (which owns its lifecycle and can be handed a
 * stub in tests), while standalone scripts create — and close — their own.
 *
 * `env` already validated DATABASE_URL at import time, so there is nothing to
 * re-check here.
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
}
