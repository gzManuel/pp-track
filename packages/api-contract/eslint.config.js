import { fileURLToPath } from "url";
import path from "path";
import tseslint from "typescript-eslint";
import { config as baseConfig } from "@repo/eslint-config/base";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  ...baseConfig,
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
);
