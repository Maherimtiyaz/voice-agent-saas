import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return url;
}

// Reuse the connection across hot reloads in dev; Next.js re-evaluates
// modules on every edit, and a fresh postgres() client per reload would
// leak connections against the database's connection limit.
const client =
  globalThis.__dbClient ??
  postgres(getConnectionString(), {
    // Small pool: this is a single Next.js server process, not a
    // per-request-process model. Tune up for production load.
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbClient = client;
}

export const db = drizzle(client, { schema });

/**
 * Driver-agnostic type used throughout the service layer, rather than
 * `typeof db` (which would tie every service function to the
 * postgres-js driver specifically). Tests inject a pglite-backed
 * database that satisfies this same shape — see tests/db-test-helper.ts.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

