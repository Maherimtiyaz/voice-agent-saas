import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  applyEndOfCallReport,
  applyStatusUpdate,
  appendTranscriptForVapiCall,
  findCallByVapiCallId,
  markWebhookEventProcessed,
  recordWebhookEventIfNew,
} from "@/server/services/call.service";
import { verifyVapiWebhookSecret } from "@/server/integrations/vapi/verify";
import {
  vapiEndOfCallReportSchema,
  vapiEnvelopeSchema,
  vapiStatusUpdateSchema,
  vapiToolCallsSchema,
  vapiTranscriptSchema,
} from "@/server/integrations/vapi/webhook-schemas";
import { executeTool } from "@/server/tools/executor";
import { ensureToolsRegistered } from "@/server/tools/definitions";

ensureToolsRegistered();

/**
 * The ONLY place Vapi server messages are handled. Kept thin on
 * purpose: verify -> dedupe -> parse -> hand off to call.service. All
 * the actual state-transition logic (status mapping, ended-reason ->
 * our call status, sequence numbering) lives in the service layer so
 * it's testable without an HTTP request — see
 * tests/server/call.service.test.ts.
 */
export async function POST(request: NextRequest) {
  let secretOk: boolean;
  try {
    secretOk = verifyVapiWebhookSecret(request.headers.get("x-vapi-secret"));
  } catch (error) {
    // Misconfigured server (VAPI_WEBHOOK_SECRET missing) — an internal
    // problem, not something to describe to the caller.
    console.error("[voice/vapi] webhook secret not configured", error);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!secretOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const envelope = vapiEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { type } = envelope.data.message;
  const rawCall = (envelope.data.message as { call?: { id?: unknown } }).call;
  const callId = rawCall?.id ? String(rawCall.id) : "unknown-call";

  // tool-calls is synchronous request/response within a live conversation
  // — Vapi is blocking on this exact HTTP response to keep the call
  // going, so it's handled separately from the async events below and
  // does NOT go through the webhook_events dedupe ledger (that ledger is
  // for "don't double-apply the same async retry"; a tool call is a
  // direct RPC, and every tool execution already gets its own row in
  // tool_executions via the executor regardless).
  if (type === "tool-calls") {
    const parsed = vapiToolCallsSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const call = await findCallByVapiCallId(db, parsed.data.message.call.id);
    if (!call) {
      console.warn(`[voice/vapi] tool-calls for unknown vapi call ${parsed.data.message.call.id}`);
      // Still respond per-toolCallId so the assistant doesn't hang —
      // just with a clean failure for each one.
      const results = parsed.data.message.toolCallList.map((toolCall) => ({
        toolCallId: toolCall.id,
        result: "This call could not be identified.",
      }));
      return NextResponse.json({ results });
    }

    const results = await Promise.all(
      parsed.data.message.toolCallList.map(async (toolCall) => {
        const result = await executeTool(db, {
          toolName: toolCall.name,
          rawInput: toolCall.parameters ?? toolCall.arguments ?? {},
          context: { organizationId: call.organizationId, agentId: call.agentId, callId: call.id },
        });
        return {
          toolCallId: toolCall.id,
          result: result.success ? JSON.stringify(result.data) : result.error,
        };
      }),
    );

    return NextResponse.json({ results });
  }

  // Neither event type nor call id alone is a safe dedupe key (the same
  // call legitimately gets many transcript chunks); Vapi doesn't hand us
  // a documented per-message event id, so we derive one ourselves: call
  // id + type + a hash of the exact payload. An identical retried
  // payload hashes identically and is skipped; two distinct transcript
  // chunks for the same call hash differently and are both kept.
  const contentHash = createHash("sha256").update(rawBody).digest("hex").slice(0, 16);
  const externalEventId = `${callId}:${type}:${contentHash}`;

  const dedupe = await recordWebhookEventIfNew(db, {
    provider: "vapi",
    externalEventId,
    eventType: type,
    payload: envelope.data as unknown as Record<string, unknown>,
  });

  if (!dedupe.isNew) {
    // Already processed — ack without touching call/transcript state again.
    return NextResponse.json({});
  }

  try {
    switch (type) {
      case "status-update": {
        const parsed = vapiStatusUpdateSchema.safeParse(json);
        if (parsed.success) {
          await applyStatusUpdate(db, {
            vapiCallId: parsed.data.message.call.id,
            vapiStatus: parsed.data.message.status,
            timestampMs: parsed.data.message.timestamp,
          });
        }
        break;
      }
      case "transcript": {
        const parsed = vapiTranscriptSchema.safeParse(json);
        // Only final chunks are persisted — partials are noise for a
        // call-history view. See db/schema.ts callTranscripts comment.
        if (parsed.success && parsed.data.message.transcriptType === "final") {
          await appendTranscriptForVapiCall(db, {
            vapiCallId: parsed.data.message.call.id,
            role: parsed.data.message.role,
            content: parsed.data.message.transcript,
          });
        }
        break;
      }
      case "end-of-call-report": {
        const parsed = vapiEndOfCallReportSchema.safeParse(json);
        if (parsed.success) {
          await applyEndOfCallReport(db, {
            vapiCallId: parsed.data.message.call.id,
            endedReason: parsed.data.message.call.endedReason,
            durationSeconds: parsed.data.message.durationSeconds,
            endedAtMs: parsed.data.message.timestamp,
            summary: parsed.data.message.summary ?? parsed.data.message.analysis?.summary,
          });
        }
        break;
      }
      default:
        // Unhandled message type (e.g. function-call, hang, speech-update
        // — none of which Phase 1 uses). Ack so Vapi doesn't retry.
        break;
    }

    if (dedupe.id) {
      await markWebhookEventProcessed(db, dedupe.id);
    }
  } catch (error) {
    // Never leak internals to the caller; the event is already recorded
    // in webhook_events (processedAt stays null) for diagnosis.
    console.error(`[voice/vapi] failed processing ${type} for call ${callId}`, error);
  }

  return NextResponse.json({});
}
