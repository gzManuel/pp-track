import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";

/**
 * ESLint config for test files (*.test.ts / *.test.tsx).
 *
 * Enforces:
 * - ESLint comments: must have descriptions and cannot be stale
 * - Test naming: all it() titles must start with "should " (convention, not enforced by ESLint)
 *
 * Allows non-null assertions in test files since they're necessary when accessing mock.calls arrays.
 */
export const config = [
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    plugins: {
      "eslint-comments": eslintComments,
    },
    rules: {
      "eslint-comments/require-description": "error",
      "eslint-comments/no-unused-disable": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
