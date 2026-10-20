import { beforeAll, describe, expect, it } from "vitest";
import webhooks from "twilio/lib/webhooks/webhooks";

beforeAll(() => {
  process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
  process.env.APP_URL = "https://example.com";
});

describe("Twilio webhook signature verification", () => {
  it("accepts a correctly signed request", async () => {
    const { verifyTwilioSignature, getTwilioWebhookUrl } = await import(
      "@/server/integrations/twilio/verify"
    );
    const url = getTwilioWebhookUrl("/api/voice/twilio/inbound");
    const params = { CallSid: "CA123", From: "+15005550006", To: "+14155551234" };
    const signature = webhooks.getExpectedTwilioSignature("test-auth-token", url, params);

    expect(verifyTwilioSignature({ signatureHeader: signature, url, params })).toBe(true);
  });

  it("accepts handoff callback URLs signed with their opaque query id", async () => {
    const { verifyTwilioSignature, getTwilioWebhookUrl } = await import(
      "@/server/integrations/twilio/verify"
    );
    const url = getTwilioWebhookUrl(
      "/api/voice/twilio/handoff/whisper?handoffId=1df9d590-4428-4b48-b64d-1ae59b2175aa",
    );
    const params = {
      CallSid: "CA-child",
      ParentCallSid: "CA-parent",
      From: "+14155550100",
    };
    const signature = webhooks.getExpectedTwilioSignature("test-auth-token", url, params);

    expect(verifyTwilioSignature({ signatureHeader: signature, url, params })).toBe(true);
  });

  it("rejects a tampered payload (params changed after signing)", async () => {
    const { verifyTwilioSignature, getTwilioWebhookUrl } = await import(
      "@/server/integrations/twilio/verify"
    );
    const url = getTwilioWebhookUrl("/api/voice/twilio/inbound");
    const signature = webhooks.getExpectedTwilioSignature("test-auth-token", url, {
      CallSid: "CA123",
      From: "+15005550006",
    });

    const tamperedParams = { CallSid: "CA123", From: "+19995550000" };
    expect(verifyTwilioSignature({ signatureHeader: signature, url, params: tamperedParams })).toBe(
      false,
    );
  });

  it("rejects a request signed with a different auth token", async () => {
    const { verifyTwilioSignature, getTwilioWebhookUrl } = await import(
      "@/server/integrations/twilio/verify"
    );
    const url = getTwilioWebhookUrl("/api/voice/twilio/inbound");
    const params = { CallSid: "CA123" };
    const signature = webhooks.getExpectedTwilioSignature("wrong-token", url, params);

    expect(verifyTwilioSignature({ signatureHeader: signature, url, params })).toBe(false);
  });

  it("rejects a missing signature header", async () => {
    const { verifyTwilioSignature, getTwilioWebhookUrl } = await import(
      "@/server/integrations/twilio/verify"
    );
    const url = getTwilioWebhookUrl("/api/voice/twilio/inbound");
    expect(
      verifyTwilioSignature({ signatureHeader: null, url, params: { CallSid: "CA123" } }),
    ).toBe(false);
  });
});
