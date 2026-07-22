import "dotenv/config";
import { z } from "zod";

/**
 * Startup environment validation. Parsing happens once at import time, so a
 * misconfigured server crashes at boot with a clear message instead of starting
 * and failing in confusing ways later — most importantly, it guarantees
 * `INTERNAL_API_SECRET` is present so the auth guards can never fail open.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  INTERNAL_API_SECRET: z.string().min(1, "INTERNAL_API_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default("0.0.0.0"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
