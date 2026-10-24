import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./tests/server-only-stub.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    // The default 5s test timeout and 10s hook timeout are too tight
    // for this suite: every service test spins up a fresh in-memory
    // Postgres (pglite) in `beforeEach`, and the auth tests do bcrypt
    // hashing (12 rounds) on top of that. On a loaded or
    // memory-constrained machine those two together reliably exceed
    // the defaults, which shows up as a flaky timeout rather than a
    // real failure. Raising them costs nothing when the machine is
    // healthy and removes the flake when it is not.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
