import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs before each test file's module graph is evaluated — see the file for
    // why that ordering matters.
    setupFiles: ["./vitest.setup.ts"],
  },
});
