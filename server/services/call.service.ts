import { and, desc, eq, max } from "drizzle-orm";
import type { Database } from "@/db";
import {
  agents,
  callTranscripts,
  calls,
  phoneNumbers,
  webhookEvents,
} from "@/db/schema";
import type { Call, CallStatus, CallTranscript, CallOutcome, TranscriptRole, WebhookProvider } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { isUniqueViolation } from "@/server/db-errors";
import { requireMembership } from "@/server/services/organization.service";


// ---------------------------------------------------------------------
// Call lifecycle — written from the (trusted, signature-verified)
// provider webhook routes. No membership checks here: by the time these
// run, tenant identity has already been established via
// resolvePhoneNumberForInboundCall (phone_number.service.ts), which IS
// the trust boundary. These functions just persist what that boundary
// already resolved.
// ---------------------------------------------------------------------

export interface StartCallParams {
  organizationId: string;
  agentId: string;
  phoneNumberId: string;
  twilioCallSid: string;
  vapiCallId: string | null;
  fromNumber: string;
  toNumber: string;
}

/**
 * Idempotent on `twilioCallSid`: Twilio can retry the inbound webhook
 * (slow response, transient network error) before ever hearing back
 * from us. If a call for this SID already exists, return it unchanged
 * rather than erroring or creating a duplicate.
 */
export async function startCall(db: Database, params: StartCallParams): Promise<Call> {
  try {
    const [call] = await db
      .insert(calls)
      .values({
        organizationId: params.organizationId,
        agentId: params.agentId,
        phoneNumberId: params.phoneNumberId,
        twilioCallSid: params.twilioCallSid,
        vapiCallId: params.vapiCallId,
        fromNumber: params.fromNumber,
        toNumber: params.toNumber,
        status: "ringing",
      })
      .returning();
    return call;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db
        .select()
        .from(calls)
        .where(eq(calls.twilioCallSid, params.twilioCallSid))
        .limit(1);
      if (existing) return existing;
    }
    throw error;
  }
}

export interface RecordFailedCallParams {
  organizationId: string;
  agentId: string | null;
  phoneNumberId: string | null;
  twilioCallSid: string;
  fromNumber: string;
  toNumber: string;
  reason: string;
}

/**
 * For inbound calls we can't route at all (no agent configured, or the
 * upstream Vapi call-creation request failed) — recorded as `failed`
 * rather than silently dropped, so it's visible in the dashboard/call
 * history instead of just vanishing. `agentId`/`phoneNumberId` may be
 * null (e.g. the dialed number matched no row at all).
 */
export async function recordFailedCall(
  db: Database,
  params: RecordFailedCallParams,
): Promise<Call | null> {
  if (!params.agentId || !params.phoneNumberId) {
    // Nothing to foreign-key against (calls.agent_id / phone_number_id
    // are NOT NULL) — there is genuinely no organization-scoped row to
    // create for "someone dialed a number we've never heard of". Log
    // only; this is intentionally not a database write.
    console.warn(
      `[voice] rejected inbound call ${params.twilioCallSid} to unregistered number ${params.toNumber}: ${params.reason}`,
    );
    return null;
  }

  try {
    const [call] = await db
      .insert(calls)
      .values({
        organizationId: params.organizationId,
        agentId: params.agentId,
        phoneNumberId: params.phoneNumberId,
        twilioCallSid: params.twilioCallSid,
        fromNumber: params.fromNumber,
        toNumber: params.toNumber,
        status: "failed",
        endedReason: params.reason,
        endedAt: new Date(),
      })
      .returning();
    return call;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db
        .select()
        .from(calls)
        .where(eq(calls.twilioCallSid, params.twilioCallSid))
        .limit(1);
      return existing ?? null;
    }
    throw error;
  }
}

export async function findCallByVapiCallId(db: Database, vapiCallId: string): Promise<Call | null> {
  const [call] = await db.select().from(calls).where(eq(calls.vapiCallId, vapiCallId)).limit(1);
  return call ?? null;
}

/** Convenience wrapper for the webhook route: append a transcript line by Vapi call id rather than our internal call id. */
export async function appendTranscriptForVapiCall(
  db: Database,
  params: { vapiCallId: string; role: TranscriptRole; content: string },
): Promise<CallTranscript | null> {
  const call = await findCallByVapiCallId(db, params.vapiCallId);
  if (!call) {
    console.warn(`[voice] transcript for unknown vapi call ${params.vapiCallId}`);
    return null;
  }
  return appendTranscript(db, { callId: call.id, role: params.role, content: params.content });
}

const VAPI_STATUS_MAP: Record<string, CallStatus> = {
  queued: "ringing",
  ringing: "ringing",
  "in-progress": "in_progress",
  forwarding: "in_progress",
  ended: "completed", // refined by applyEndOfCallReport moments later
};

export async function applyStatusUpdate(
  db: Database,
  params: { vapiCallId: string; vapiStatus: string; timestampMs?: number },
): Promise<Call | null> {
  const call = await findCallByVapiCallId(db, params.vapiCallId);
  if (!call) {
    console.warn(`[voice] status-update for unknown vapi call ${params.vapiCallId}`);
    return null;
  }

  const nextStatus = VAPI_STATUS_MAP[params.vapiStatus] ?? call.status;
  const answeredAt =
    !call.answeredAt && nextStatus === "in_progress"
      ? params.timestampMs
        ? new Date(params.timestampMs)
        : new Date()
      : call.answeredAt;

  const [updated] = await db
    .update(calls)
    .set({ status: nextStatus, answeredAt, updatedAt: new Date() })
    .where(eq(calls.id, call.id))
    .returning();

  return updated;
}

const ENDED_REASON_STATUS_MAP: Array<[RegExp, CallStatus]> = [
  [/voicemail/i, "voicemail"],
  [/no-answer|customer-did-not-answer|silence-timed-out/i, "no_answer"],
  [
    /error|failed|pipeline-error|unknown|assistant-not-found|twilio-failed|exceeded-max-duration/i,
    "failed",
  ],
];

function resolveFinalStatus(endedReason: string | undefined): CallStatus {
  if (!endedReason) return "completed";
  for (const [pattern, status] of ENDED_REASON_STATUS_MAP) {
    if (pattern.test(endedReason)) return status;
  }
  return "completed";
}

export interface EndOfCallReportParams {
  vapiCallId: string;
  endedReason?: string;
  durationSeconds?: number;
  endedAtMs?: number;
  summary?: string;
}

export async function applyEndOfCallReport(
  db: Database,
  params: EndOfCallReportParams,
): Promise<Call | null> {
  const call = await findCallByVapiCallId(db, params.vapiCallId);
  if (!call) {
    console.warn(`[voice] end-of-call-report for unknown vapi call ${params.vapiCallId}`);
    return null;
  }

  const endedAt = params.endedAtMs ? new Date(params.endedAtMs) : new Date();

  const [updated] = await db
    .update(calls)
    .set({
      status: resolveFinalStatus(params.endedReason),
      endedReason: params.endedReason ?? null,
      endedAt,
      durationSeconds: params.durationSeconds ?? null,
      updatedAt: new Date(),
    })
    .where(eq(calls.id, call.id))
    .returning();

  if (params.summary) {
    await appendTranscript(db, {
      callId: call.id,
      role: "system",
      content: params.summary,
      metadata: { source: "end-of-call-report.summary" },
    });
  }

  return updated;
}

/**
 * Sets the call's business-outcome summary — called by the tool
 * executor (server/tools/executor.ts) right after a tool succeeds with
 * a declared `outcome`. Overwrites any previous outcome on the same
 * call: this is a "most recent meaningful thing that happened" field,
 * not a history (the full history is `tool_executions`).
 */
export async function setCallOutcome(
  db: Database,
  params: { callId: string; outcome: CallOutcome },
): Promise<void> {
  await db
    .update(calls)
    .set({ outcome: params.outcome, updatedAt: new Date() })
    .where(eq(calls.id, params.callId));
}

// ---------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------

export async function appendTranscript(
  db: Database,
  params: {
    callId: string;
    role: TranscriptRole;
    content: string;
    timestamp?: Date;
    metadata?: Record<string, unknown>;
  },
): Promise<CallTranscript> {
  const [{ value: currentMax }] = await db
    .select({ value: max(callTranscripts.sequenceNumber) })
    .from(callTranscripts)
    .where(eq(callTranscripts.callId, params.callId));

  const [row] = await db
    .insert(callTranscripts)
    .values({
      callId: params.callId,
      role: params.role,
      content: params.content,
      timestamp: params.timestamp ?? new Date(),
      sequenceNumber: (currentMax ?? 0) + 1,
      metadata: params.metadata,
    })
    .returning();

  return row;
}

// ---------------------------------------------------------------------
// Webhook idempotency ledger
// ---------------------------------------------------------------------

/**
 * Atomic dedupe gate: tries to insert the (provider, externalEventId)
 * row. A unique-constraint failure means this exact event was already
 * recorded — the caller should skip processing and return the
 * provider's expected "ok" response without touching call/transcript
 * state again. See app/api/voice/vapi/events and .../twilio/inbound for
 * how each provider's externalEventId is derived (neither provider
 * hands us one directly — see the schema.ts comment on webhookEvents).
 */
export async function recordWebhookEventIfNew(
  db: Database,
  params: {
    provider: WebhookProvider;
    externalEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<{ isNew: boolean; id: string | null }> {
  try {
    const [row] = await db
      .insert(webhookEvents)
      .values({
        provider: params.provider,
        externalEventId: params.externalEventId,
        eventType: params.eventType,
        payload: params.payload,
      })
      .returning({ id: webhookEvents.id });
    return { isNew: true, id: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { isNew: false, id: null };
    }
    throw error;
  }
}

export async function markWebhookEventProcessed(db: Database, id: string): Promise<void> {
  await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, id));
}

// ---------------------------------------------------------------------
// Org-scoped reads — for the dashboard
// ---------------------------------------------------------------------

export interface CallWithDetails extends Call {
  agentName: string;
  phoneNumberE164: string;
}

export async function listCalls(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<CallWithDetails[]> {
  await requireMembership(db, params);

  return db
    .select({
      id: calls.id,
      organizationId: calls.organizationId,
      agentId: calls.agentId,
      phoneNumberId: calls.phoneNumberId,
      twilioCallSid: calls.twilioCallSid,
      vapiCallId: calls.vapiCallId,
      fromNumber: calls.fromNumber,
      toNumber: calls.toNumber,
      status: calls.status,
      endedReason: calls.endedReason,
      outcome: calls.outcome,
      startedAt: calls.startedAt,
      answeredAt: calls.answeredAt,
      endedAt: calls.endedAt,
      durationSeconds: calls.durationSeconds,
      createdAt: calls.createdAt,
      updatedAt: calls.updatedAt,
      agentName: agents.name,
      phoneNumberE164: phoneNumbers.e164Number,
    })
    .from(calls)
    .innerJoin(agents, eq(calls.agentId, agents.id))
    .innerJoin(phoneNumbers, eq(calls.phoneNumberId, phoneNumbers.id))
    .where(eq(calls.organizationId, params.organizationId))
    .orderBy(desc(calls.startedAt));
}

export interface CallDetail extends CallWithDetails {
  transcripts: CallTranscript[];
}

export async function getCallDetail(
  db: Database,
  params: { organizationId: string; userId: string; callId: string },
): Promise<CallDetail> {
  await requireMembership(db, params);

  const [call] = await db
    .select({
      id: calls.id,
      organizationId: calls.organizationId,
      agentId: calls.agentId,
      phoneNumberId: calls.phoneNumberId,
      twilioCallSid: calls.twilioCallSid,
      vapiCallId: calls.vapiCallId,
      fromNumber: calls.fromNumber,
      toNumber: calls.toNumber,
      status: calls.status,
      endedReason: calls.endedReason,
      outcome: calls.outcome,
      startedAt: calls.startedAt,
      answeredAt: calls.answeredAt,
      endedAt: calls.endedAt,
      durationSeconds: calls.durationSeconds,
      createdAt: calls.createdAt,
      updatedAt: calls.updatedAt,
      agentName: agents.name,
      phoneNumberE164: phoneNumbers.e164Number,
    })
    .from(calls)
    .innerJoin(agents, eq(calls.agentId, agents.id))
    .innerJoin(phoneNumbers, eq(calls.phoneNumberId, phoneNumbers.id))
    .where(and(eq(calls.id, params.callId), eq(calls.organizationId, params.organizationId)))
    .limit(1);

  // Scoping by BOTH the call id and organizationId in the same WHERE is
  // what makes this refuse a real call id from another organization —
  // see tests/server/call.service.test.ts for the case this blocks.
  if (!call) {
    throw new NotFoundError("Call");
  }

  const transcripts = await db
    .select()
    .from(callTranscripts)
    .where(eq(callTranscripts.callId, call.id))
    .orderBy(callTranscripts.sequenceNumber);

  return { ...call, transcripts };
}
