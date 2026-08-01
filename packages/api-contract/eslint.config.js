import { fileURLToPath } from "url";
import path from "path";
import tseslint from "typescript-eslint";
import { config as baseConfig } from "@repo/eslint-config/base";
import { config as testConfig } from "@repo/eslint-config/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  ...baseConfig,
  ...testConfig,
  {
    // Anchor the TS project root explicitly — see the apps' configs for why.
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    // Test-specific rule overrides.
    files: ["src/**/*.test.ts"],
    rules: {
      // Non-null assertions are necessary when accessing mock.calls arrays in tests.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
