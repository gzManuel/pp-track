import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

// `env` already validated DATABASE_URL at startup — no re-checking here.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export default new PrismaClient({ adapter });
