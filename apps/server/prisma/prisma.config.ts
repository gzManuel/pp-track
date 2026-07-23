import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";
import { config } from "dotenv";

// Resolve everything from this file's directory so the prisma CLI works no
// matter which directory it is invoked from (repo root, apps/server, ...).
const configDir = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(configDir, "../.env") });

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: path.resolve(configDir, "schema.prisma"),
  migrations: {
    path: path.resolve(configDir, "migrations"),
  },
  datasource: {
    url: env<Env>("DATABASE_URL"),
  },
});
