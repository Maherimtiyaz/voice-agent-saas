import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  getTwilioWebhookUrl,
  verifyTwilioSignature,
} from "@/server/integrations/twilio/verify";
import { handoffFailedTwiml } from "@/server/integrations/twilio/twiml";
import { finishCallHandoff } from "@/server/services/handoff.service";

const WEBHOOK_PATH = "/api/voice/twilio/handoff/status";

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

  const twilioCallSid = params.CallSid;
  const dialStatus = params.DialCallStatus;
  if (!twilioCallSid || !dialStatus) {
    return twimlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>", 400);
  }

  const status =
    dialStatus === "completed"
      ? "completed"
      : dialStatus === "busy" || dialStatus === "no-answer"
        ? "no_answer"
        : "failed";
  const updated = await finishCallHandoff(db, {
    handoffId,
    twilioCallSid,
    status,
  });
  if (!updated) {
    return twimlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>", 404);
  }

  if (status === "no_answer") {
    return twimlResponse(handoffFailedTwiml());
  }
  return twimlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
}
