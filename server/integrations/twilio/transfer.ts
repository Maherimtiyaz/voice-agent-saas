import "server-only";
import twilio from "twilio";

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
  announcement?: string;
}): Promise<void> {
  const client = getClient();
  const say = params.announcement
    ? `<Say>${escapeXml(params.announcement)}</Say>`
    : "";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Dial>${escapeXml(
    params.destinationNumber,
  )}</Dial></Response>`;

  await client.calls(params.twilioCallSid).update({ twiml });
}
