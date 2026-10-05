import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Server modules are tested directly; the guard only matters inside Next.js bundles.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  // Each database test file starts its own in-memory Postgres; too many at once starve each other.
  test: { environment: "node", testTimeout: 30_000, hookTimeout: 120_000, maxWorkers: 3 },
});
