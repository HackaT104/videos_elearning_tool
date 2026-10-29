import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/worker/test/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
