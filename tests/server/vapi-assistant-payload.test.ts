import { describe, expect, it } from "vitest";
import { buildAssistantPayload } from "@/server/integrations/vapi/assistant";
import type { Agent } from "@/db/schema";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    organizationId: "org-1",
    name: "Front Desk Assistant",
    description: null,
    systemPrompt: null,
    voiceConfig: null,
    language: "en",
    status: "draft",
    vapiAssistantId: null,
    transferNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("buildAssistantPayload", () => {
  it("uses the agent's system prompt when set", () => {
    const agent = makeAgent({ systemPrompt: "You help customers book appointments." });
    const payload = buildAssistantPayload(agent, "https://example.com/api/voice/vapi/events");
    expect(payload.model.messages[0]).toEqual({
      role: "system",
      content: "You help customers book appointments.",
    });
  });

  it("falls back to a generic prompt when no system prompt is set", () => {
    const agent = makeAgent({ systemPrompt: null });
    const payload = buildAssistantPayload(agent, "https://example.com/api/voice/vapi/events");
    expect(payload.model.messages[0].content).toContain(agent.name);
  });

  it("omits voice config when the agent hasn't set one, rather than inventing a default", () => {
    const agent = makeAgent({ voiceConfig: null });
    const payload = buildAssistantPayload(agent, "https://example.com/api/voice/vapi/events");
    expect(payload.voice).toBeUndefined();
  });

  it("passes through a well-formed voice config", () => {
    const agent = makeAgent({ voiceConfig: { provider: "11labs", voiceId: "abc123" } });
    const payload = buildAssistantPayload(agent, "https://example.com/api/voice/vapi/events");
    expect(payload.voice).toEqual({ provider: "11labs", voiceId: "abc123" });
  });

  it("always points serverUrl at our own webhook endpoint", () => {
    const agent = makeAgent();
    const payload = buildAssistantPayload(agent, "https://example.com/api/voice/vapi/events");
    expect(payload.serverUrl).toBe("https://example.com/api/voice/vapi/events");
  });
});
