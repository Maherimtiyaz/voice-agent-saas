import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { calls, toolExecutions } from "@/db/schema";
import type { CallOutcome, CallStatus } from "@/db/schema";
import { requireMembership } from "@/server/services/organization.service";

const TREND_DAYS = 14;

export interface CallSummary {
  totalCalls: number;
  byStatus: Record<CallStatus, number>;
  byOutcome: Partial<Record<CallOutcome, number>> & { none: number };
  averageDurationSeconds: number | null;
  /** Daily call counts for the last `TREND_DAYS` days, oldest first. */
  dailyVolume: Array<{ date: string; count: number }>;
}

const EMPTY_STATUS_COUNTS: Record<CallStatus, number> = {
  ringing: 0,
  in_progress: 0,
  completed: 0,
  failed: 0,
  no_answer: 0,
  voicemail: 0,
};

function dateKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * All aggregation happens in application code over a single fetch of
 * this organization's calls (scoped by `organization_id`, same trust
 * boundary as every other org-scoped read), rather than dialect-specific
 * SQL date-bucketing — this keeps the query portable across the
 * postgres-js driver and the pglite driver used in tests, and Phase
 * 1.2's call volumes don't warrant anything fancier yet.
 */
export async function getCallSummary(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<CallSummary> {
  await requireMembership(db, params);

  const rows = await db
    .select({
      status: calls.status,
      outcome: calls.outcome,
      durationSeconds: calls.durationSeconds,
      startedAt: calls.startedAt,
    })
    .from(calls)
    .where(eq(calls.organizationId, params.organizationId));

  const byStatus = { ...EMPTY_STATUS_COUNTS };
  const byOutcome: CallSummary["byOutcome"] = { none: 0 };
  let durationSum = 0;
  let durationCount = 0;

  const trendStart = new Date();
  trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));
  trendStart.setUTCHours(0, 0, 0, 0);
  const dailyCounts = new Map<string, number>();
  for (let i = 0; i < TREND_DAYS; i++) {
    const day = new Date(trendStart.getTime() + i * 24 * 60 * 60_000);
    dailyCounts.set(dateKeyUtc(day), 0);
  }

  for (const row of rows) {
    byStatus[row.status] += 1;

    if (row.outcome) {
      byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
    } else {
      byOutcome.none += 1;
    }

    if (row.durationSeconds != null) {
      durationSum += row.durationSeconds;
      durationCount += 1;
    }

    const key = dateKeyUtc(row.startedAt);
    if (dailyCounts.has(key)) {
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    totalCalls: rows.length,
    byStatus,
    byOutcome,
    averageDurationSeconds: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
    dailyVolume: Array.from(dailyCounts.entries()).map(([date, count]) => ({ date, count })),
  };
}

export interface ToolUsageSummary {
  toolName: string;
  successCount: number;
  failureCount: number;
}

export async function getToolUsageSummary(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<ToolUsageSummary[]> {
  await requireMembership(db, params);

  const rows = await db
    .select({ toolName: toolExecutions.toolName, status: toolExecutions.status })
    .from(toolExecutions)
    .where(eq(toolExecutions.organizationId, params.organizationId));

  const byTool = new Map<string, ToolUsageSummary>();
  for (const row of rows) {
    const entry = byTool.get(row.toolName) ?? {
      toolName: row.toolName,
      successCount: 0,
      failureCount: 0,
    };
    if (row.status === "success") entry.successCount += 1;
    else entry.failureCount += 1;
    byTool.set(row.toolName, entry);
  }

  return Array.from(byTool.values()).sort(
    (a, b) => b.successCount + b.failureCount - (a.successCount + a.failureCount),
  );
}
