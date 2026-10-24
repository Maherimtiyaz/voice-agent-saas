import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { rateLimitCounters } from "@/db/schema";

/**
 * Fixed-window rate limiting backed by Postgres.
 *
 * Why a table and not an in-process Map: the app is deployed to
 * serverless (Vercel), where there is no single long-lived process and
 * no shared memory between concurrent instances. An in-memory limiter
 * would be defeated by simply making more requests land on another
 * instance. Postgres is already a hard dependency of every request, so
 * it is the one place that is actually shared.
 *
 * Why fixed windows and not a sliding window: a fixed window is one
 * atomic statement, which is what makes the limit actually hold under
 * concurrency. The trade-off is the classic "burst across the window
 * boundary" (up to 2x the limit right at a boundary). That is an
 * acceptable trade for abuse control — the alternative (a sliding
 * window or token bucket) needs either a lock or a much more
 * expensive query, and this app's limits are generous relative to
 * real traffic.
 *
 * The counter is incremented with a single UPSERT that returns the
 * new count:
 *
 *   INSERT INTO rate_limit_counters (bucket, key, window_start, count)
 *   VALUES (..., 1)
 *   ON CONFLICT (bucket, key, window_start)
 *   DO UPDATE SET count = rate_limit_counters.count + 1, updated_at = now()
 *   RETURNING count
 *
 * Because the read-modify-write happens inside one statement, two
 * concurrent requests cannot both read `count = 4` and both write
 * `count = 5`. The second one sees 5 and writes 6. This is the whole
 * point of doing it this way instead of SELECT-then-UPDATE.
 */

export type RateLimitBucket =
  | "public_api"
  | "auth_register"
  | "auth_login"
  | "demo_request";

export interface RateLimitResult {
  /** Whether this request is allowed to proceed. */
  allowed: boolean;
  /** How many requests have been counted in the current window. */
  count: number;
  /** The limit that applied. */
  limit: number;
  /** Seconds until the current window rolls over. */
  retryAfterSeconds: number;
}

/** Bucket name -> (limit, window length). */
export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  // Workspace API keys: 120 requests per minute per key.
  public_api: { limit: 120, windowSeconds: 60 },
  // Account creation: 5 per hour per email address. Also per IP in
  // the caller, so one address can't be used to fan out registrations.
  auth_register: { limit: 5, windowSeconds: 3600 },
  // Sign-in attempts: 10 per 15 minutes per email address.
  auth_login: { limit: 10, windowSeconds: 900 },
  // Public landing-page form: 5 per hour per IP. The form is
  // unauthenticated, so this is the only thing standing between it
  // and being used to generate spam leads.
  demo_request: { limit: 5, windowSeconds: 3600 },
};

/**
 * Per-bucket limit overrides, keyed by a caller-supplied label.
 *
 * The same bucket is used for two different keys in the auth flows:
 * the email address being targeted (strict) and the caller's IP
 * (lenient, because an office, a mobile carrier, or a shared NAT can
 * legitimately produce a lot of sign-ins from one address). Without
 * this split, a shared IP would lock out its own users.
 */
export const RATE_LIMIT_OVERRIDES: Partial<
  Record<RateLimitBucket, Record<string, { limit: number }>>
> = {
  auth_register: {
    ip: { limit: 20 },
  },
  auth_login: {
    ip: { limit: 60 },
  },
};

function windowStartFor(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  // Floor to the window boundary so every caller in the same window
  // computes the identical `window_start` value and lands on the same
  // conflict target.
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function resolveLimit(
  bucket: RateLimitBucket,
  variant: string | undefined,
): { limit: number; windowSeconds: number } {
  const base = RATE_LIMITS[bucket];
  const override =
    variant !== undefined
      ? RATE_LIMIT_OVERRIDES[bucket]?.[variant]
      : undefined;
  return {
    limit: override?.limit ?? base.limit,
    windowSeconds: base.windowSeconds,
  };
}

/**
 * Counts one request against `key` in `bucket` and reports whether it
 * is within the limit.
 *
 * The request IS counted even when it is over the limit — that is
 * intentional. A caller that keeps hammering stays over the limit
 * instead of having its counter reset by the rejected attempts.
 *
 * `variant` selects a per-key limit override (see
 * RATE_LIMIT_OVERRIDES) for buckets that are used with more than one
 * kind of key.
 */
export async function consumeRateLimit(
  db: Database,
  params: {
    bucket: RateLimitBucket;
    key: string;
    variant?: string;
    now?: Date;
  },
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = resolveLimit(params.bucket, params.variant);
  const now = params.now ?? new Date();
  const windowStart = windowStartFor(now, windowSeconds);

  const [row] = await db
    .insert(rateLimitCounters)
    .values({
      bucket: params.bucket,
      key: params.key,
      windowStart,
      count: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        rateLimitCounters.bucket,
        rateLimitCounters.key,
        rateLimitCounters.windowStart,
      ],
      set: {
        count: sql`${rateLimitCounters.count} + 1`,
        updatedAt: now,
      },
    })
    .returning({ count: rateLimitCounters.count });

  const count = row?.count ?? 1;
  const windowEnd = new Date(windowStart.getTime() + windowSeconds * 1000);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEnd.getTime() - now.getTime()) / 1000),
  );

  return {
    allowed: count <= limit,
    count,
    limit,
    retryAfterSeconds,
  };
}

/**
 * Checks a limit WITHOUT counting the request.
 *
 * Used where we want to fail fast (e.g. rejecting a duplicate
 * registration email) without the attempt counting against the
 * caller's remaining budget.
 */
export async function peekRateLimit(
  db: Database,
  params: {
    bucket: RateLimitBucket;
    key: string;
    variant?: string;
    now?: Date;
  },
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = resolveLimit(params.bucket, params.variant);
  const now = params.now ?? new Date();
  const windowStart = windowStartFor(now, windowSeconds);

  const [row] = await db
    .select({ count: rateLimitCounters.count })
    .from(rateLimitCounters)
    .where(
      and(
        eq(rateLimitCounters.bucket, params.bucket),
        eq(rateLimitCounters.key, params.key),
        eq(rateLimitCounters.windowStart, windowStart),
      ),
    )
    .limit(1);

  const count = row?.count ?? 0;
  const windowEnd = new Date(windowStart.getTime() + windowSeconds * 1000);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEnd.getTime() - now.getTime()) / 1000),
  );

  return {
    allowed: count < limit,
    count,
    limit,
    retryAfterSeconds,
  };
}

/**
 * Deletes counters for windows that have already closed.
 *
 * Rows are cheap and the table is naturally small (one row per
 * active caller per window), but the table is unbounded over time
 * without a cleanup, so this is meant to be called periodically from
 * a cron job rather than on the request path.
 */
export async function pruneRateLimitCounters(
  db: Database,
  params: { olderThan: Date },
): Promise<number> {
  const deleted = await db
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.windowStart, params.olderThan))
    .returning({ bucket: rateLimitCounters.bucket });
  return deleted.length;
}
