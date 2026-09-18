import "server-only";
import { vapiRequest } from "@/server/integrations/vapi/client";

export interface CreateBypassCallParams {
  /** The Vapi phone-number record id (from importing the Twilio number into Vapi). */
  vapiPhoneNumberId: string;
  assistantId: string;
  /** The caller's number, E.164. */
  customerNumber: string;
}

export interface CreateBypassCallResult {
  /** Vapi's own id for this call — stored as calls.vapi_call_id. */
  vapiCallId: string;
  /** TwiML to hand straight back to Twilio so it bridges the call to Vapi. */
  twiml: string;
}

interface VapiBypassCallResponse {
  id: string;
  phoneCallProviderDetails?: { twiml?: string };
}

/**
 * "Phone call bypass" is the documented pattern for keeping a Twilio
 * number's Voice webhook pointed at YOUR server (so YOU resolve which
 * agent/assistant handles the call, per our own phone_numbers/agents
 * tables) instead of importing the number into Vapi and letting Vapi
 * own the Twilio webhook outright. Our server receives the Twilio
 * inbound webhook, calls this, and returns the TwiML we get back to
 * Twilio — see app/api/voice/twilio/inbound/route.ts.
 *
 * NOT exercised against the real Vapi API in this environment — no
 * live credentials were available. The request shape here matches
 * Vapi's own documented/support-provided example as of this writing;
 * verify it against a real call before relying on it in production.
 */
export async function createBypassCall(
  params: CreateBypassCallParams,
): Promise<CreateBypassCallResult> {
  const response = await vapiRequest<VapiBypassCallResponse>("/call", {
    method: "POST",
    body: {
      phoneNumberId: params.vapiPhoneNumberId,
      assistantId: params.assistantId,
      phoneCallProviderBypassEnabled: true,
      customer: { number: params.customerNumber },
    },
  });

  const twiml = response.phoneCallProviderDetails?.twiml;
  if (!twiml) {
    throw new Error("Vapi did not return TwiML for the bypass call.");
  }

  return { vapiCallId: response.id, twiml };
}
