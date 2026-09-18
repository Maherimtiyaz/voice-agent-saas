import type { Metadata } from "next";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { getCallSummary, getToolUsageSummary } from "@/server/services/analytics.service";

export const metadata: Metadata = {
  title: "Analytics",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

export default async function AnalyticsPage() {
  const { user, organizationId } = await requireCurrentContext();
  const [callSummary, toolUsage] = await Promise.all([
    getCallSummary(db, { organizationId, userId: user.id }),
    getToolUsageSummary(db, { organizationId, userId: user.id }),
  ]);

  const maxDailyCount = Math.max(1, ...callSummary.dailyVolume.map((d) => d.count));
  const outcomeEntries = Object.entries(callSummary.byOutcome).filter(([, count]) => count > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted">
          Call volume, outcomes, and tool usage across this workspace.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total calls" value={callSummary.totalCalls} />
        <StatCard label="Completed" value={callSummary.byStatus.completed} />
        <StatCard
          label="Failed / no answer"
          value={callSummary.byStatus.failed + callSummary.byStatus.no_answer}
        />
        <StatCard
          label="Avg. duration"
          value={formatDuration(callSummary.averageDurationSeconds)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call volume — last 14 days</CardTitle>
          <CardDescription>Inbound calls per day (UTC).</CardDescription>
        </CardHeader>
        {callSummary.totalCalls === 0 ? (
          <p className="text-sm text-muted">No calls yet.</p>
        ) : (
          <div className="flex items-end gap-1.5" style={{ height: "120px" }}>
            {callSummary.dailyVolume.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-accent/70"
                  style={{
                    height: `${Math.max(4, (day.count / maxDailyCount) * 96)}px`,
                  }}
                  title={`${day.date}: ${day.count} call${day.count === 1 ? "" : "s"}`}
                />
                <span className="text-[10px] text-muted">{day.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Call status</CardTitle>
          </CardHeader>
          <dl className="flex flex-col gap-2 text-sm">
            {Object.entries(callSummary.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <dt className="capitalize text-muted">{status.replace("_", " ")}</dt>
                <dd className="font-medium text-foreground">{count}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Call outcomes</CardTitle>
            <CardDescription>
              Set when a tool call achieves something (booking, job, transfer, SMS) —
              not every call has one.
            </CardDescription>
          </CardHeader>
          {outcomeEntries.length === 0 ? (
            <p className="text-sm text-muted">No outcomes recorded yet.</p>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              {outcomeEntries.map(([outcome, count]) => (
                <div key={outcome} className="flex items-center justify-between">
                  <dt className="capitalize text-muted">{outcome.replace(/_/g, " ")}</dt>
                  <dd className="font-medium text-foreground">{count}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tool usage</CardTitle>
          <CardDescription>How often each tool has been called, and its success rate.</CardDescription>
        </CardHeader>
        {toolUsage.length === 0 ? (
          <p className="text-sm text-muted">No tool calls yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Tool</th>
                  <th className="px-4 py-2 font-medium">Successes</th>
                  <th className="px-4 py-2 font-medium">Failures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {toolUsage.map((tool) => (
                  <tr key={tool.toolName}>
                    <td className="px-4 py-2 font-mono text-xs text-foreground">{tool.toolName}</td>
                    <td className="px-4 py-2 text-foreground">{tool.successCount}</td>
                    <td className="px-4 py-2 text-foreground">{tool.failureCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
