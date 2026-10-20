import "server-only";
import twilio from "twilio";
import { getTwilioWebhookUrl } from "@/server/integrations/twilio/verify";

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set.");
  }
  return twilio(accountSid, authToken);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildHandoffTransferTwiml(params: {
  destinationNumber: string;
  handoffId: string;
  announcement?: string;
}): string {
  const handoffId = encodeURIComponent(params.handoffId);
  const whisperUrl = new URL(
    `${getTwilioWebhookUrl("/api/voice/twilio/handoff/whisper")}?handoffId=${handoffId}`,
  ).toString();
  const statusUrl = new URL(
    `${getTwilioWebhookUrl("/api/voice/twilio/handoff/status")}?handoffId=${handoffId}`,
  ).toString();
  const say = params.announcement
    ? `<Say>${escapeXml(params.announcement)}</Say>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>${say}` +
    `<Dial action="${escapeXml(statusUrl)}" method="POST" timeout="25">` +
    `<Number url="${escapeXml(whisperUrl)}" method="POST">${escapeXml(
      params.destinationNumber,
    )}</Number></Dial></Response>`
  );
}

/**
 * Redirects a LIVE, in-progress Twilio call to a new destination by
 * updating the Call resource with fresh TwiML (`client.calls(sid).update
 * ({ twiml })`) — Twilio's own documented pattern for transferring an
 * active AI-agent call to a human ("Modify Calls In Progress"). This
 * takes the call away from whatever Vapi's bypass connection had it
 * doing and hands it to a plain <Dial>; Vapi's side of the call ends
 * once Twilio stops streaming to it.
 */
export async function transferLiveCall(params: {
  twilioCallSid: string;
  destinationNumber: string;
  handoffId: string;
  announcement?: string;
}): Promise<void> {
  const client = getClient();
  await client.calls(params.twilioCallSid).update({
    twiml: buildHandoffTransferTwiml(params),
  });
}
