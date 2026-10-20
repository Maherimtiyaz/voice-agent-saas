import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  getTwilioWebhookUrl,
  verifyTwilioSignature,
} from "@/server/integrations/twilio/verify";
import {
  handoffWhisperTwiml,
} from "@/server/integrations/twilio/twiml";
import {
  getCallHandoffContext,
  markCallHandoffConnected,
} from "@/server/services/handoff.service";

const WEBHOOK_PATH = "/api/voice/twilio/handoff/whisper";

function twimlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const handoffId = url.searchParams.get("handoffId");
  if (!handoffId || !/^[\da-f-]{36}$/i.test(handoffId)) {
    return new NextResponse("Invalid handoff.", { status: 400 });
  }

  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  let signatureValid: boolean;
  try {
    signatureValid = verifyTwilioSignature({
      signatureHeader: request.headers.get("x-twilio-signature"),
      url: getTwilioWebhookUrl(
        `${WEBHOOK_PATH}?handoffId=${encodeURIComponent(handoffId)}`,
      ),
      params,
    });
  } catch (error) {
    console.error("[voice/twilio/handoff] signature verification misconfigured", error);
    return new NextResponse("Server misconfigured.", { status: 500 });
  }
  if (!signatureValid) {
    return new NextResponse("Invalid signature.", { status: 403 });
  }

  const parentCallSid = params.ParentCallSid;
  const calledLegSid = params.CallSid;
  if (!parentCallSid || !calledLegSid) {
    return twimlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>", 400);
  }

  const handoff = await getCallHandoffContext(db, {
    handoffId,
    twilioCallSid: parentCallSid,
  });
  if (!handoff) {
    return twimlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>", 404);
  }

  await markCallHandoffConnected(db, {
    handoffId,
    twilioCallSid: parentCallSid,
  });

  return twimlResponse(handoffWhisperTwiml(handoff.summary, handoff.fromNumber));
}
