import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handoffFailedTwiml,
  handoffWhisperTwiml,
} from "@/server/integrations/twilio/twiml";
import { buildHandoffTransferTwiml } from "@/server/integrations/twilio/transfer";
import { summarizeCallForHandoff } from "@/server/integrations/openai/handoff-summary";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("human handoff briefing", () => {
  it("generates a concise briefing from the conversation transcript", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Caller needs help rescheduling an appointment." } }],
          }),
          { status: 200 },
        ),
      ),
    );

    const summary = await summarizeCallForHandoff(
      [
        { role: "user", content: "I need to move my appointment to Friday." },
        { role: "assistant", content: "I can connect you with someone to help." },
      ],
      "Reschedule request",
    );

    expect(summary).toBe("Caller needs help rescheduling an appointment.");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-api-key" }),
      }),
    );
  });

  it("keeps the transfer usable with a transcript fallback when OpenAI is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const summary = await summarizeCallForHandoff(
      [{ role: "user", content: "I was charged twice for the same invoice." }],
      "Billing issue",
    );

    expect(summary).toContain("automatic summary unavailable");
    expect(summary).toContain("charged twice");
    expect(summary).toContain("Billing issue");
  });

  it("escapes the briefing in TwiML and provides caller-facing no-answer text", () => {
    const twiml = handoffWhisperTwiml("Caller said <help> & asked for billing.", "+14155550100");
    expect(twiml).toContain("&lt;help&gt; &amp;");
    expect(handoffFailedTwiml()).toContain("couldn&apos;t connect");
  });

  it("configures a private recipient whisper and a signed-status callback in transfer TwiML", () => {
    vi.stubEnv("APP_URL", "https://voice.example.com");

    const twiml = buildHandoffTransferTwiml({
      destinationNumber: "+14155550199",
      handoffId: "1df9d590-4428-4b48-b64d-1ae59b2175aa",
      announcement: "Please hold while I transfer your call.",
    });

    expect(twiml).toContain(
      'action="https://voice.example.com/api/voice/twilio/handoff/status?handoffId=1df9d590-4428-4b48-b64d-1ae59b2175aa"',
    );
    expect(twiml).toContain(
      'url="https://voice.example.com/api/voice/twilio/handoff/whisper?handoffId=1df9d590-4428-4b48-b64d-1ae59b2175aa"',
    );
    expect(twiml).toContain("<Number");
    expect(twiml).toContain("+14155550199</Number>");
  });
});
