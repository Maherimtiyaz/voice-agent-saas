import "server-only";
import twilio from "twilio";

/**
 * Twilio signs every form-encoded webhook request with an
 * X-Twilio-Signature header (base64 HMAC-SHA1 of the request URL plus
 * sorted POST params, keyed with your Auth Token). Twilio explicitly
 * recommends using the SDK's own validator rather than reimplementing
 * this — `twilio.validateRequest` does exactly that. See
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security.
 */
export function verifyTwilioSignature(params: {
  signatureHeader: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN is not set. Add it to .env.");
  }
  if (!params.signatureHeader) return false;

  return twilio.validateRequest(
    authToken,
    params.signatureHeader,
    params.url,
    params.params,
  );
}

/**
 * Builds the exact URL Twilio signed against. Twilio signs the URL it
 * actually requested — which, behind a proxy/load balancer, is not
 * reliably reconstructable from the incoming Request object (host
 * headers get rewritten). APP_URL is the canonical public origin this
 * app is deployed at; it must exactly match what's configured as this
 * number's Voice webhook URL in the Twilio console.
 */
export function getTwilioWebhookUrl(pathname: string): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error(
      "APP_URL is not set. Add it to .env — it must be the exact public URL this app is deployed at.",
    );
  }
  return new URL(pathname, appUrl).toString();
}
