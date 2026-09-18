import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { listCalls } from "@/server/services/call.service";

export const metadata: Metadata = {
  title: "Calls",
};

const STATUS_STYLES: Record<string, string> = {
  ringing: "bg-black/[0.06] text-foreground",
  in_progress: "bg-accent/10 text-accent",
  completed: "bg-accent/10 text-accent",
  failed: "bg-red-100 text-danger",
  no_answer: "bg-black/[0.06] text-muted",
  voicemail: "bg-black/[0.06] text-muted",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatOutcome(outcome: string | null): string {
  if (!outcome) return "—";
  return outcome.replace(/_/g, " ");
}

export default async function CallsPage() {
  const { user, organizationId } = await requireCurrentContext();
  const calls = await listCalls(db, { organizationId, userId: user.id });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Calls</h1>
        <p className="text-sm text-muted">Inbound calls handled by your agents.</p>
      </div>

      {calls.length === 0 ? (
        <Card className="items-center text-center">
          <CardHeader>
            <CardTitle>No calls yet</CardTitle>
            <CardDescription>
              Calls will show up here once a Twilio number is registered,
              assigned to an agent, and dialed.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Caller</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/calls/${call.id}`} className="text-accent hover:underline">
                      {call.startedAt.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{call.fromNumber}</td>
                  <td className="px-4 py-3 text-foreground">{call.agentName}</td>
                  <td className="px-4 py-3 text-foreground">{formatDuration(call.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        STATUS_STYLES[call.status] ?? STATUS_STYLES.ringing
                      }`}
                    >
                      {call.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground capitalize">
                    {formatOutcome(call.outcome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
