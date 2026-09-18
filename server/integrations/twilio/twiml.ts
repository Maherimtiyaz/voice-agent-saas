function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Only used for our OWN fallback cases (number not configured, upstream
 * error) — the "happy path" TwiML that actually bridges to Vapi comes
 * from Vapi's API response itself (see server/integrations/vapi/call.ts)
 * and is passed through as-is, never constructed by us.
 */
export function sayAndHangupTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(message)}</Say><Hangup/></Response>`;
}
