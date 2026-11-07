/**
 * Liveness/readiness probe.
 *
 * Returns 200 only when the app can reach Postgres, because a process
 * that answers HTTP but cannot read the database is not serving
 * traffic — every dashboard page and every webhook would fail. Hosts,
 * uptime monitors, and container orchestrators can poll this without
 * credentials.
 *
 * The body is deliberately shallow: no table names, no driver
 * messages, no configuration values. A failing check reports only
 * that the database is unavailable, so the endpoint cannot be used to
 * enumerate infrastructure.
 */

// Never cached: a stale "ok" defeats the purpose of a probe.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();

  try {
    // Imported lazily so a missing DATABASE_URL surfaces as a 503
    // instead of a module-evaluation crash at build time.
    const [{ db }, { sql }] = await Promise.all([
      import("@/db"),
      import("drizzle-orm"),
    ]);

    await db.execute(sql`select 1`);

    return Response.json(
      {
        status: "ok",
        checks: { database: "ok" },
        responseTimeMs: Date.now() - startedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Logged server-side only: the response body must not leak driver or
    // configuration detail to an unauthenticated caller.
    console.error("[health] database check failed:", error);
    return Response.json(
      {
        status: "unavailable",
        checks: { database: "error" },
        responseTimeMs: Date.now() - startedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
