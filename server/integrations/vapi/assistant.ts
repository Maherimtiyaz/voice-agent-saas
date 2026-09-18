import "server-only";
import type { Agent } from "@/db/schema";
import { vapiRequest } from "@/server/integrations/vapi/client";
import { buildVapiToolDefinitions, type VapiFunctionDefinition } from "@/server/tools/registry";
import { ensureToolsRegistered } from "@/server/tools/definitions";

interface VapiVoiceConfig {
  provider: string;
  voiceId: string;
}

function isVapiVoiceConfig(value: unknown): value is VapiVoiceConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).provider === "string" &&
    typeof (value as Record<string, unknown>).voiceId === "string"
  );
}

export interface VapiAssistantPayload {
  name: string;
  firstMessage?: string;
  model: {
    provider: "openai";
    model: string;
    messages: Array<{ role: "system"; content: string }>;
    tools?: VapiFunctionDefinition[];
  };
  voice?: VapiVoiceConfig;
  transcriber?: { provider: "deepgram"; language: string };
  serverUrl: string;
}

/**
 * Pure mapping from our stored Agent config to Vapi's assistant shape —
 * kept separate from the actual HTTP call so it can be unit tested
 * without network access or credentials.
 *
 * Fields NOT stored on our Agent (LLM choice) get a fixed, documented
 * default for Phase 1 rather than being invented per call; `voice` and
 * `transcriber` are omitted entirely when the agent hasn't configured
 * them, so Vapi's own account defaults apply instead of us guessing a
 * voice/model id that might not exist on the caller's Vapi account.
 *
 * `model.tools` is the full, fixed tool registry (server/tools/) — see
 * that directory for what each tool does and how it's authorized. Every
 * synced assistant gets every registered tool; there is no per-agent
 * tool selection in Phase 1.1.
 */
export function buildAssistantPayload(
  agent: Agent,
  serverUrl: string,
): VapiAssistantPayload {
  ensureToolsRegistered();

  const payload: VapiAssistantPayload = {
    name: agent.name,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: agent.systemPrompt?.trim() || `You are ${agent.name}, a helpful phone assistant.`,
        },
      ],
      tools: buildVapiToolDefinitions(),
    },
    serverUrl,
  };

  if (isVapiVoiceConfig(agent.voiceConfig)) {
    payload.voice = agent.voiceConfig;
  }

  if (agent.language) {
    payload.transcriber = { provider: "deepgram", language: agent.language };
  }

  return payload;
}

interface VapiAssistantResponse {
  id: string;
}

/**
 * Creates the assistant on Vapi if the agent has never been synced
 * (`vapiAssistantId` is null), otherwise PATCHes the existing one.
 * Returns the Vapi assistant id to store on the Agent row — the caller
 * (server/services/agent.service.ts) is responsible for persisting it.
 *
 * NOT unit tested against the real Vapi API in this environment — no
 * live VAPI_PRIVATE_API_KEY was available. `buildAssistantPayload`
 * above (the part that doesn't need network access) is tested instead.
 */
export async function syncAssistantWithVapi(
  agent: Agent,
  serverUrl: string,
): Promise<string> {
  const payload = buildAssistantPayload(agent, serverUrl);

  const response = agent.vapiAssistantId
    ? await vapiRequest<VapiAssistantResponse>(`/assistant/${agent.vapiAssistantId}`, {
        method: "PATCH",
        body: payload,
      })
    : await vapiRequest<VapiAssistantResponse>("/assistant", {
        method: "POST",
        body: payload,
      });

  return response.id;
}
