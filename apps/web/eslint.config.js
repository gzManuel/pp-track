import { fileURLToPath } from "url";
import path from "path";
import tseslint from "typescript-eslint";
import { nextJsConfig } from "@repo/eslint-config/next-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  ...nextJsConfig,
  {
    // Anchor the TS project root for EVERY file this config lints — not just the
    // type-checked globs below, but also this config file, next.config, etc.
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
    // Type-aware linting for the app's own source. Config/build files (next.config,
    // postcss.config, this file) fall back to the base, non-type-checked rules.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "middleware.ts"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    // Vendored shadcn/ui components are generated code (regenerated via the shadcn
    // CLI), and their Recharts-heavy wrappers are inherently `any`-typed upstream.
    // Exempt them from type-aware rules; they still get the base + React rules.
    files: ["components/shadcn/**/*.{ts,tsx}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
