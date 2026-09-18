import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Vapi's Server URL has NO authentication by default — it's opt-in per
 * endpoint via a Custom Credential in the Vapi dashboard. Of the four
 * credential types Vapi documents (Bearer Token, legacy X-Vapi-Secret,
 * OAuth 2.0, configurable HMAC), this implements the X-Vapi-Secret
 * shared-secret check: you create an "X-Vapi-Secret" credential in the
 * Vapi dashboard with a token value, and Vapi sends that exact value
 * back in the X-Vapi-Secret header on every request. We just compare it.
 *
 * The HMAC credential type is a stronger option (signs the payload
 * rather than sending a bearer value) but has no pinned default — its
 * header name and payload format are configured per-credential in
 * Vapi's dashboard with no fixed scheme to implement against. Phase 1
 * uses the shared-secret path; upgrading to HMAC is a later hardening
 * step, not a Phase 1 requirement.
 */
export function verifyVapiWebhookSecret(headerValue: string | null): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error(
      "VAPI_WEBHOOK_SECRET is not set. Add it to .env and configure the same value as an X-Vapi-Secret credential on your Vapi Server URL.",
    );
  }
  if (!headerValue) return false;

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(headerValue);
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
