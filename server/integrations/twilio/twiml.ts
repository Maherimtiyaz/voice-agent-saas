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

export function connectMediaStreamTwiml(params: {
  streamUrl: string;
  authToken: string;
}): string {
  const url = new URL(params.streamUrl);
  if (
    url.protocol !== "wss:" ||
    url.pathname !== "/media-streams" ||
    url.search ||
    url.hash
  ) {
    throw new Error("MEDIA_STREAMS_URL must be a WSS URL ending in /media-streams without a query or fragment.");
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Connect><Stream url="${escapeXml(url.toString())}">` +
    `<Parameter name="auth" value="${escapeXml(params.authToken)}"/>` +
    `</Stream></Connect></Response>`
  );
}
