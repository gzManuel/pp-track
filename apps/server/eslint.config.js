import { fileURLToPath } from "url";
import path from "path";
import tseslint from "typescript-eslint";
import { config as baseConfig } from "@repo/eslint-config/base";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  ...baseConfig,
  {
    // CommonJS by design (pm2 reads it as CJS); the flat config's ESM globals
    // would flag `module`/`__dirname`.
    ignores: ["ecosystem.config.cjs"],
  },
  {
    // Anchor the TS project root for EVERY file this config lints — not just the
    // type-checked `src` glob below, but also this config file, scripts/, etc.
    // Without an explicit root, typescript-eslint auto-detects it and, seeing
    // tsconfigs under both apps/web and apps/server (e.g. when the editor's ESLint
    // runs from the repo root), fails with "multiple candidate TSConfigRootDirs".
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    // Type-aware linting only covers files in the TS program (tsconfig `include`).
    // scripts/, prisma/, and this config file fall back to the base rules.
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Fastify's idiomatic plugin/handler signature is `async` even when there's
      // no top-level await (the type provider and route registration require it),
      // so require-await is pure noise in this codebase.
      "@typescript-eslint/require-await": "off",
    },
  },
);
