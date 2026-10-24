import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { rateLimitCounters } from "@/db/schema";
import {
  consumeRateLimit,
  peekRateLimit,
  pruneRateLimitCounters,
  RATE_LIMITS,
} from "@/server/services/rate-limit.service";

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("rate limiting", () => {
  it("allows requests up to the limit and rejects the one after it", async () => {
    const limit = RATE_LIMITS.demo_request.limit;

    for (let i = 0; i < limit; i++) {
      const result = await consumeRateLimit(db, {
        bucket: "demo_request",
        key: "203.0.113.7",
      });
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(i + 1);
    }

    const rejected = await consumeRateLimit(db, {
      bucket: "demo_request",
      key: "203.0.113.7",
    });
    expect(rejected.allowed).toBe(false);
    expect(rejected.count).toBe(limit + 1);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps counting after the limit is exceeded so a caller cannot reset by retrying", async () => {
    const limit = RATE_LIMITS.demo_request.limit;
    for (let i = 0; i < limit + 3; i++) {
      await consumeRateLimit(db, { bucket: "demo_request", key: "198.51.100.9" });
    }

    const result = await consumeRateLimit(db, {
      bucket: "demo_request",
      key: "198.51.100.9",
    });
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(limit + 4);
  });

  it("tracks each key independently", async () => {
    const limit = RATE_LIMITS.demo_request.limit;
    for (let i = 0; i < limit; i++) {
      await consumeRateLimit(db, { bucket: "demo_request", key: "198.51.100.1" });
    }

    const other = await consumeRateLimit(db, {
      bucket: "demo_request",
      key: "198.51.100.2",
    });
    expect(other.allowed).toBe(true);
    expect(other.count).toBe(1);
  });

  it("counts concurrent requests correctly rather than losing increments", async () => {
    // The counter is incremented in a single UPSERT, so simultaneous
    // requests must not all read the same pre-increment value and
    // write the same result. Fire them together and check the total.
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit(db, { bucket: "public_api", key: "key-1" }),
      ),
    );

    const counts = results.map((result) => result.count).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("uses a separate window for each bucket and key combination", async () => {
    await consumeRateLimit(db, { bucket: "demo_request", key: "shared" });
    await consumeRateLimit(db, { bucket: "auth_login", key: "shared" });

    const rows = await db.select().from(rateLimitCounters);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.bucket)).size).toBe(2);
  });

  it("applies a per-variant limit override", async () => {
    // The "ip" variant of auth_register is deliberately more generous
    // than the per-email limit, because a shared office IP must not
    // lock out its own users.
    const first = await consumeRateLimit(db, {
      bucket: "auth_register",
      key: "203.0.113.1",
      variant: "ip",
    });
    expect(first.limit).toBeGreaterThan(RATE_LIMITS.auth_register.limit);
    expect(first.allowed).toBe(true);
  });

  it("peeking reports the current count without consuming a request", async () => {
    await consumeRateLimit(db, { bucket: "demo_request", key: "192.0.2.5" });
    await consumeRateLimit(db, { bucket: "demo_request", key: "192.0.2.5" });

    const peeked = await peekRateLimit(db, {
      bucket: "demo_request",
      key: "192.0.2.5",
    });
    expect(peeked.count).toBe(2);

    const peekedAgain = await peekRateLimit(db, {
      bucket: "demo_request",
      key: "192.0.2.5",
    });
    expect(peekedAgain.count).toBe(2);
  });

  it("starts a fresh count in the next window", async () => {
    // `public_api` uses a 60-second window, so 10:30 and 10:32 fall
    // in different windows.
    const now = new Date("2026-03-01T10:30:00.000Z");
    const first = await consumeRateLimit(db, {
      bucket: "public_api",
      key: "192.0.2.9",
      now,
    });
    expect(first.count).toBe(1);

    // 90 seconds later, with a 60-second window, this is a new window.
    const later = await consumeRateLimit(db, {
      bucket: "public_api",
      key: "192.0.2.9",
      now: new Date("2026-03-01T10:32:00.000Z"),
    });
    expect(later.count).toBe(1);
    expect(later.allowed).toBe(true);
  });

  it("prunes counters for windows that have closed", async () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    await consumeRateLimit(db, {
      bucket: "demo_request",
      key: "stale",
      now: old,
    });
    await consumeRateLimit(db, {
      bucket: "demo_request",
      key: "fresh",
      now: new Date("2026-03-01T10:30:00.000Z"),
    });

    const removed = await pruneRateLimitCounters(db, {
      olderThan: new Date("2026-02-01T00:00:00.000Z"),
    });
    expect(removed).toBe(1);

    const remaining = await db
      .select()
      .from(rateLimitCounters)
      .where(eq(rateLimitCounters.key, "fresh"));
    expect(remaining).toHaveLength(1);
  });
});
