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

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

type ConfiguredSslMode = "require" | "verify-full" | "prefer" | "disable";
/** What postgres.js accepts: every mode except our `disable` alias. */
type SslOption = Exclude<ConfiguredSslMode, "disable"> | false;

const SSL_MODES: readonly ConfiguredSslMode[] = [
  "require",
  "verify-full",
  "prefer",
  "disable",
];

/**
 * Database TLS.
 *
 * The default is fail-safe: any host that is not localhost gets
 * `ssl: "require"`, even if `sslmode` is missing from the URL. A missing
 * parameter used to mean "plaintext", which would put credentials and
 * tenant/PII data on the wire unencrypted. Production refuses to start if
 * someone explicitly disables TLS for a remote host.
 *
 * `verify-full` is available for providers where the CA chain is trusted;
 * `require` encrypts without validating the certificate, which is what
 * most managed Postgres URLs negotiate by default.
 */
function resolveSsl(url: URL): SslOption {
  const configured = process.env.DATABASE_SSL?.trim().toLowerCase();
  const local = isLocalHost(url.hostname);

  if (configured) {
    if (!SSL_MODES.includes(configured as ConfiguredSslMode)) {
      throw new Error(
        `DATABASE_SSL must be one of ${SSL_MODES.join(", ")} (got "${configured}").`,
      );
    }
    if (configured === "disable" && !local) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Refusing to connect to a remote database without TLS. Remove DATABASE_SSL=disable or use sslmode=require.",
        );
      }
      console.warn(
        "[db] DATABASE_SSL=disable against a non-local host; this is only acceptable for a trusted private network.",
      );
    }
    return configured === "disable" ? false : (configured as SslOption);
  }

  return local ? false : "require";
}

/**
 * Pool size.
 *
 * On serverless every concurrent function instance gets its own client, so
 * the useful pool is small and the provider's pooler (PgBouncer, Neon,
 * Supabase) does the real multiplexing. The previous hard-coded 10 per
 * instance could exhaust a database's connection limit on its own.
 */
function resolvePoolMax(local: boolean): number {
  const raw = process.env.DATABASE_POOL_MAX;
  const fallback = local ? 10 : 3;
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("DATABASE_POOL_MAX must be an integer between 1 and 100.");
  }
  return parsed;
}

/**
 * Prepared statements are not safe through a transaction-mode pooler
 * (Supabase's port 6543, PgBouncer in transaction mode). Set
 * DATABASE_PREPARE=false for those hosts.
 */
function resolvePrepare(): boolean {
  return process.env.DATABASE_PREPARE?.trim().toLowerCase() !== "false";
}

function createClient(): ReturnType<typeof postgres> {
  const connectionString = getConnectionString();
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid postgres:// connection string.");
  }

  const local = isLocalHost(url.hostname);

  return postgres(connectionString, {
    ssl: resolveSsl(url),
    max: resolvePoolMax(local),
    prepare: resolvePrepare(),
    // Recycle idle connections instead of holding them for the lifetime of
    // a long-lived Node process (the standalone server, not Vercel).
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Reuse the connection across hot reloads in dev; Next.js re-evaluates
// modules on every edit, and a fresh postgres() client per reload would
// leak connections against the database's connection limit.
const client = globalThis.__dbClient ?? createClient();

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
