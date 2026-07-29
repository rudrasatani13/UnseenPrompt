import { defineConfig } from "vitest/config";

/**
 * Database integration tests that require a live Supabase Postgres.
 * Invoked only by `pnpm test:db:concurrency` (CI database job).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
