/**
 * Shared prompt fragments for phone agents.
 *
 * Both voice paths assemble their own instructions — Vapi's managed
 * assistant (`server/integrations/vapi/assistant.ts`) and the custom
 * OpenAI Realtime bridge (`server/media-streams/realtime-protocol.ts`) —
 * but compliance-relevant text must not drift between them.
 */

/**
 * Spoken recording disclosure.
 *
 * Every call this product handles is recorded and transcribed. Consent
 * law in the US is state-by-state: some states require one party's
 * consent, others require every party to be told. A recording beep is
 * not enough for a spoken phone call, so the disclosure is part of the
 * agent's instructions and is spoken in the agent's own voice, in the
 * language the agent is configured to speak.
 *
 * It is deliberately short: it is the first thing a caller hears, and a
 * long preamble makes people hang up.
 */
export const RECORDING_DISCLOSURE =
  "Recording disclosure: at the very start of the call, immediately after your greeting and before asking how you can help, say one short sentence telling the caller that this call may be recorded and transcribed. Use the caller's language. Do not skip this, even if the caller starts talking first. If the caller says they do not want to be recorded, offer to transfer them to a person (if a transfer number is configured) or end the call politely.";
