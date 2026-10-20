import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMediaStreamToken,
  verifyMediaStreamToken,
} from "@/server/integrations/twilio/media-stream-auth";
import { connectMediaStreamTwiml } from "@/server/integrations/twilio/twiml";
import {
  buildRealtimeSessionUpdate,
  parseTwilioStartMessage,
} from "@/server/media-streams/realtime-protocol";
import type { Agent } from "@/db/schema";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Twilio Media Streams authentication", () => {
  it("signs short-lived tokens and rejects tampered or expired tokens", () => {
    vi.stubEnv("MEDIA_STREAMS_SECRET", "test-media-stream-secret-at-least-32");
    const token = createMediaStreamToken({ callId: "call-1", callSid: "CA123" }, 100);

    expect(verifyMediaStreamToken(token, 101)).toEqual({
      callId: "call-1",
      callSid: "CA123",
      expiresAt: 400,
    });
    expect(verifyMediaStreamToken(`${token}x`, 101)).toBeNull();
    expect(verifyMediaStreamToken(token, 400)).toBeNull();
  });

  it("emits secure bidirectional TwiML and rejects non-WSS stream targets", () => {
    const twiml = connectMediaStreamTwiml({
      streamUrl: "wss://streams.example.com/media-streams",
      authToken: "signed-token",
    });

    expect(twiml).toContain("<Connect><Stream url=\"wss://streams.example.com/media-streams\">");
    expect(twiml).toContain("<Parameter name=\"auth\" value=\"signed-token\"/>");
    expect(() =>
      connectMediaStreamTwiml({
        streamUrl: "ws://streams.example.com/media-streams",
        authToken: "signed-token",
      }),
    ).toThrow("WSS URL");
  });
});

describe("OpenAI Realtime Media Streams protocol", () => {
  const agent = {
    id: "agent-1",
    organizationId: "org-1",
    name: "Reception",
    description: null,
    systemPrompt: "Help callers schedule a visit.",
    voiceConfig: null,
    language: "en",
    status: "draft",
    voiceProvider: "openai_realtime",
    vapiAssistantId: null,
    vapiKnowledgeToolId: null,
    transferNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies Agent;

  it("validates Twilio start metadata and enforces matching stream SIDs", () => {
    const start = {
      event: "start",
      streamSid: "MZ123",
      start: {
        callSid: "CA123",
        streamSid: "MZ123",
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { auth: "signed-token" },
      },
    };

    expect(parseTwilioStartMessage(start)).toEqual(start);
    expect(
      parseTwilioStartMessage({
        ...start,
        start: { ...start.start, streamSid: "MZ-other" },
      }),
    ).toBeNull();
  });

  it("builds an audio/PCMU Realtime session with the agent prompt and fixed tools", () => {
    const event = buildRealtimeSessionUpdate(agent);

    expect(event.type).toBe("session.update");
    expect(event.session.audio.input.format).toEqual({ type: "audio/pcmu" });
    expect(event.session.audio.output).toEqual({
      format: { type: "audio/pcmu" },
      voice: "marin",
    });
    expect(event.session.instructions).toContain(agent.systemPrompt);
    expect(event.session.tools.map((tool) => tool.name)).toContain("transfer_call");
  });
});
