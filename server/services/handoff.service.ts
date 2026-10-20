import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import {
  callHandoffs,
  callTranscripts,
  calls,
  type CallHandoffStatus,
} from "@/db/schema";

export async function createCallHandoff(
  db: Database,
  params: {
    organizationId: string;
    callId: string;
    destinationNumber: string;
    reason?: string;
    summary: string;
  },
) {
  const [handoff] = await db
    .insert(callHandoffs)
    .values({
      organizationId: params.organizationId,
      callId: params.callId,
      destinationNumber: params.destinationNumber,
      reason: params.reason ?? null,
      summary: params.summary,
    })
    .returning();
  return handoff;
}

export async function getCallHandoffContext(db: Database, params: {
  handoffId: string;
  twilioCallSid: string;
}) {
  const [handoff] = await db
    .select({
      id: callHandoffs.id,
      summary: callHandoffs.summary,
      reason: callHandoffs.reason,
      destinationNumber: callHandoffs.destinationNumber,
      status: callHandoffs.status,
      callId: calls.id,
      fromNumber: calls.fromNumber,
      twilioCallSid: calls.twilioCallSid,
    })
    .from(callHandoffs)
    .innerJoin(calls, eq(callHandoffs.callId, calls.id))
    .where(
      and(
        eq(callHandoffs.id, params.handoffId),
        eq(calls.twilioCallSid, params.twilioCallSid),
      ),
    )
    .limit(1);
  return handoff ?? null;
}

export async function markCallHandoffConnected(
  db: Database,
  params: { handoffId: string; twilioCallSid: string },
): Promise<boolean> {
  const handoff = await getCallHandoffContext(db, params);
  if (!handoff || handoff.status !== "initiated") return false;

  const [updated] = await db
    .update(callHandoffs)
    .set({ status: "connected", answeredAt: new Date() })
    .where(
      and(
        eq(callHandoffs.id, params.handoffId),
        eq(callHandoffs.status, "initiated"),
      ),
    )
    .returning({ id: callHandoffs.id });
  return Boolean(updated);
}

export async function finishCallHandoff(
  db: Database,
  params: {
    handoffId: string;
    twilioCallSid: string;
    status: Extract<CallHandoffStatus, "completed" | "no_answer" | "failed">;
  },
): Promise<boolean> {
  const handoff = await getCallHandoffContext(db, params);
  if (!handoff || handoff.status === "completed" || handoff.status === "no_answer" || handoff.status === "failed") {
    return false;
  }

  const [updated] = await db
    .update(callHandoffs)
    .set({ status: params.status, endedAt: new Date() })
    .where(
      and(
        eq(callHandoffs.id, params.handoffId),
        eq(callHandoffs.status, handoff.status),
      ),
    )
    .returning({ id: callHandoffs.id });
  return Boolean(updated);
}

export async function listCallHandoffs(
  db: Database,
  params: { organizationId: string; callId: string },
) {
  return db
    .select()
    .from(callHandoffs)
    .where(
      and(
        eq(callHandoffs.organizationId, params.organizationId),
        eq(callHandoffs.callId, params.callId),
      ),
    )
    .orderBy(asc(callHandoffs.createdAt));
}

export async function getHandoffTranscripts(db: Database, callId: string) {
  return db
    .select({
      role: callTranscripts.role,
      content: callTranscripts.content,
    })
    .from(callTranscripts)
    .where(eq(callTranscripts.callId, callId))
    .orderBy(asc(callTranscripts.sequenceNumber));
}
