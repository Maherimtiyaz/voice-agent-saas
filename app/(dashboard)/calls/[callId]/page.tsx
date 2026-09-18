import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { getCallDetail } from "@/server/services/call.service";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = {
  title: "Call detail",
};

const ROLE_STYLES: Record<string, string> = {
  assistant: "bg-accent/10 text-accent",
  user: "bg-black/[0.06] text-foreground",
  system: "bg-black/[0.06] text-muted italic",
};

export default async function CallDetailPage({
  params,
}: PageProps<"/calls/[callId]">) {
  const { callId } = await params;
  const { user, organizationId } = await requireCurrentContext();

  let call;
  try {
    // organizationId here comes from the session, not the URL — this is
    // what makes a call id copied from another organization 404 instead
    // of leaking that org's transcript. See
    // tests/server/call.service.test.ts for the case this blocks.
    call = await getCallDetail(db, { organizationId, userId: user.id, callId });
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Call detail</h1>
        <p className="font-mono text-xs text-muted">{call.id}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Agent</dt>
            <dd className="text-foreground">{call.agentName}</dd>
          </div>
          <div>
            <dt className="text-muted">Number</dt>
            <dd className="font-mono text-foreground">{call.phoneNumberE164}</dd>
          </div>
          <div>
            <dt className="text-muted">Caller</dt>
            <dd className="font-mono text-foreground">{call.fromNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="capitalize text-foreground">{call.status.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-muted">Started</dt>
            <dd className="text-foreground">{call.startedAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted">Ended</dt>
            <dd className="text-foreground">{call.endedAt?.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Duration</dt>
            <dd className="text-foreground">
              {call.durationSeconds != null ? `${call.durationSeconds}s` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Ended reason</dt>
            <dd className="text-foreground">{call.endedReason ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Outcome</dt>
            <dd className="capitalize text-foreground">
              {call.outcome ? call.outcome.replace(/_/g, " ") : "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
          <CardDescription>
            {call.transcripts.length === 0
              ? "No transcript recorded for this call yet."
              : `${call.transcripts.length} line${call.transcripts.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3">
          {call.transcripts.map((line) => (
            <div key={line.id} className="flex gap-3">
              <span
                className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  ROLE_STYLES[line.role] ?? ROLE_STYLES.system
                }`}
              >
                {line.role}
              </span>
              <p className="text-sm text-foreground">{line.content}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
