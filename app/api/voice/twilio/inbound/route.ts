import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { getTwilioWebhookUrl, verifyTwilioSignature } from "@/server/integrations/twilio/verify";
import {
  connectMediaStreamTwiml,
  sayAndHangupTwiml,
} from "@/server/integrations/twilio/twiml";
import { createMediaStreamToken } from "@/server/integrations/twilio/media-stream-auth";
import { createBypassCall } from "@/server/integrations/vapi/call";
import { resolvePhoneNumberForInboundCall } from "@/server/services/phone-number.service";
import {
  finishRealtimeMediaStreamCall,
  recordFailedCall,
  recordWebhookEventIfNew,
  startCall,
} from "@/server/services/call.service";

const WEBHOOK_PATH = "/api/voice/twilio/inbound";

function twimlResponse(twiml: string, status = 200) {
  return new NextResponse(twiml, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Twilio's Voice webhook for inbound calls. This is the ONLY place
 * tenant identity is established for a call: the dialed (`To`) number
 * is looked up against OUR phone_numbers table — never anything from
 * the request that a caller/LLM could influence. See
 * resolvePhoneNumberForInboundCall in phone-number.service.ts, which is
 * the trust boundary this route hands off to immediately after the
 * signature check.
 *
 * Response time matters here: Twilio is holding the caller's connection
 * open waiting for TwiML. Everything after signature verification is a
 * DB lookup plus one outbound call to Vapi's API (8s hard timeout —
 * see server/integrations/vapi/client.ts); there is no queue, retry
 * loop, or other slow work on this path, by design (see README, Phase 1
 * "Error handling and latency").
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const signatureHeader = request.headers.get("x-twilio-signature");
  let signatureValid: boolean;
  try {
    signatureValid = verifyTwilioSignature({
      signatureHeader,
      url: getTwilioWebhookUrl(WEBHOOK_PATH),
      params,
    });
  } catch (error) {
    console.error("[voice/twilio] signature verification misconfigured", error);
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  if (!signatureValid) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const callSid = params.CallSid;
  const from = params.From;
  const to = params.To;

  if (!callSid || !from || !to) {
    return twimlResponse(sayAndHangupTwiml("Sorry, something went wrong. Please try again later."), 400);
  }

  // Dedupe BEFORE calling Vapi: if Twilio retries this webhook (e.g. our
  // first response was slow enough to time out), we must not create a
  // second Vapi call for the same inbound attempt. A duplicate here
  // returns a no-op response rather than re-driving the call — see
  // README "known limitations" for why this is a deliberately simple
  // (not fully retry-safe) Phase 1 tradeoff.
  const dedupe = await recordWebhookEventIfNew(db, {
    provider: "twilio",
    externalEventId: callSid,
    eventType: "voice.inbound",
    payload: params,
  });
  if (!dedupe.isNew) {
    return twimlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>");
  }

  const resolved = await resolvePhoneNumberForInboundCall(db, to);

  if (!resolved || !resolved.agent) {
    await recordFailedCall(db, {
      organizationId: resolved?.phoneNumber.organizationId ?? "",
      agentId: null,
      phoneNumberId: resolved?.phoneNumber.id ?? null,
      twilioCallSid: callSid,
      fromNumber: from,
      toNumber: to,
      reason: resolved ? "agent_not_configured" : "phone_number_not_registered",
    });
    return twimlResponse(
      sayAndHangupTwiml("This number is not yet configured to take calls. Goodbye."),
    );
  }

  const { phoneNumber, agent } = resolved;

  if (agent.voiceProvider === "openai_realtime") {
    let callId: string | undefined;
    try {
      const call = await startCall(db, {
        organizationId: phoneNumber.organizationId,
        agentId: agent.id,
        phoneNumberId: phoneNumber.id,
        twilioCallSid: callSid,
        vapiCallId: null,
        fromNumber: from,
        toNumber: to,
      });
      callId = call.id;

      const streamUrl = process.env.MEDIA_STREAMS_URL;
      if (!streamUrl) {
        throw new Error("MEDIA_STREAMS_URL is not configured.");
      }
      const authToken = createMediaStreamToken({ callId: call.id, callSid });
      return twimlResponse(connectMediaStreamTwiml({ streamUrl, authToken }));
    } catch (error) {
      console.error(`[voice/twilio] Media Streams setup failed for ${callSid}`, error);
      if (callId) {
        await finishRealtimeMediaStreamCall(db, {
          callId,
          status: "failed",
          reason: "media_stream_setup_failed",
        });
      } else {
        await recordFailedCall(db, {
          organizationId: phoneNumber.organizationId,
          agentId: agent.id,
          phoneNumberId: phoneNumber.id,
          twilioCallSid: callSid,
          fromNumber: from,
          toNumber: to,
          reason: "media_stream_setup_failed",
        });
      }
      return twimlResponse(
        sayAndHangupTwiml("Sorry, we couldn't connect your call right now. Goodbye."),
      );
    }
  }

  if (!agent.vapiAssistantId) {
    await recordFailedCall(db, {
      organizationId: phoneNumber.organizationId,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: callSid,
      fromNumber: from,
      toNumber: to,
      reason: "agent_not_synced_to_vapi",
    });
    return twimlResponse(
      sayAndHangupTwiml("This agent isn't ready to take calls yet. Goodbye."),
    );
  }

  if (!phoneNumber.vapiPhoneNumberId) {
    await recordFailedCall(db, {
      organizationId: phoneNumber.organizationId,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: callSid,
      fromNumber: from,
      toNumber: to,
      reason: "phone_number_not_imported_to_vapi",
    });
    return twimlResponse(
      sayAndHangupTwiml("This number isn't fully set up yet. Goodbye."),
    );
  }

  try {
    const bypassCall = await createBypassCall({
      vapiPhoneNumberId: phoneNumber.vapiPhoneNumberId,
      assistantId: agent.vapiAssistantId,
      customerNumber: from,
    });

    await startCall(db, {
      organizationId: phoneNumber.organizationId,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: callSid,
      vapiCallId: bypassCall.vapiCallId,
      fromNumber: from,
      toNumber: to,
    });

    return twimlResponse(bypassCall.twiml);
  } catch (error) {
    console.error(`[voice/twilio] Vapi bypass call failed for ${callSid}`, error);
    await recordFailedCall(db, {
      organizationId: phoneNumber.organizationId,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: callSid,
      fromNumber: from,
      toNumber: to,
      reason: "vapi_call_creation_failed",
    });
    return twimlResponse(
      sayAndHangupTwiml("Sorry, we couldn't connect your call right now. Goodbye."),
    );
  }
}
