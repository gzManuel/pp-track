import eslintConfigPrettier from "eslint-config-prettier";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReact from "eslint-plugin-react";
import pluginA11y from "eslint-plugin-jsx-a11y";
import pluginNext from "@next/eslint-plugin-next";
import globals from "globals";
import { config as baseConfig } from "./base.js";

/**
 * ESLint configuration for the Next.js frontend.
 *
 * Extends the shared base (JS + typescript-eslint `recommended`) with the
 * React, React Hooks, jsx-a11y, and Next.js plugin rule sets. Type-aware
 * linting is intentionally left off here to keep linting fast.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const nextJsConfig = [
  ...baseConfig,
  {
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    settings: { react: { version: "detect" } },
  },
  // Automatic JSX runtime (Next.js): drop the old `import React` requirement.
  // Disables react/react-in-jsx-scope and react/jsx-uses-react.
  pluginReact.configs.flat["jsx-runtime"],
  {
    plugins: {
      "jsx-a11y": pluginA11y,
    },
    rules: {
      ...pluginA11y.configs.recommended.rules,
    },
  },
  {
    plugins: {
      "@next/next": pluginNext,
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
  {
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
    },
  },
  // Keep Prettier last so it wins any formatting-rule conflicts.
  eslintConfigPrettier,
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];
