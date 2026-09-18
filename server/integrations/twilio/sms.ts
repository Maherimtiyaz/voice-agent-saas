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

export interface SendSmsParams {
  to: string;
  from: string;
  body: string;
}

export interface SendSmsResult {
  messageSid: string;
  status: string;
}

/**
 * Thin wrapper around Twilio's Messages API
 * (client.messages.create({ to, from, body })) — the standard, stable,
 * long-documented way to send SMS via Twilio. `from` is always resolved
 * server-side from the organization's own registered phone number (see
 * server/tools/definitions/send-sms.ts) — never taken from tool input,
 * so the LLM can't send SMS "as" a number the organization doesn't own.
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const client = getClient();
  const message = await client.messages.create({
    to: params.to,
    from: params.from,
    body: params.body,
  });
  return { messageSid: message.sid, status: message.status };
}
