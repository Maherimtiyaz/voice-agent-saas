// The real `server-only` package unconditionally throws when its module
// body executes — it relies on bundlers (webpack/turbopack) aliasing it
// away entirely on the server graph and only leaving the throw in place
// for client bundles. Vitest runs plain Node, so we swap in this no-op
// via a resolve alias (see vitest.config.ts) instead.
export {};
