import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs before each test file's module graph is evaluated — see the file for
    // why that ordering matters.
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["src/test-support/**", "src/prisma-client.ts", "scripts/**", "prisma/generated/**"],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 85,
      },
    },
  },
});
