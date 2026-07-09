import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * A shared ESLint configuration for the repository.
 *
 * Provides the common, non-type-checked floor: JS + typescript-eslint
 * `recommended`, with Prettier disabling any formatting rules. Apps layer
 * their own stricter/type-aware or framework rules on top of this.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
    },
  },
  {
    rules: {
      // typescript-eslint's version is more accurate for TS
      "no-unused-vars": "off",
    },
  },
  {
    ignores: ["dist/**"],
  },
];
