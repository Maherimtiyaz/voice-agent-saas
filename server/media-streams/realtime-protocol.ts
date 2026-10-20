import * as z from "zod";
import type { Agent } from "@/db/schema";
import { ensureToolsRegistered } from "@/server/tools/definitions";
import { listTools } from "@/server/tools/registry";

const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
const DEFAULT_REALTIME_VOICE = "marin";

export interface TwilioStartMessage {
  event: "start";
  streamSid: string;
  start: {
    callSid: string;
    streamSid: string;
    mediaFormat: {
      encoding: "audio/x-mulaw";
      sampleRate: 8000;
      channels: 1;
    };
    customParameters: Record<string, string>;
  };
}

const twilioStartSchema = z.object({
  event: z.literal("start"),
  streamSid: z.string().min(1),
  start: z.object({
    callSid: z.string().min(1),
    streamSid: z.string().min(1),
    mediaFormat: z.object({
      encoding: z.literal("audio/x-mulaw"),
      sampleRate: z.literal(8000),
      channels: z.literal(1),
    }),
    customParameters: z.record(z.string(), z.string()),
  }),
});

export function parseTwilioStartMessage(value: unknown): TwilioStartMessage | null {
  const parsed = twilioStartSchema.safeParse(value);
  if (!parsed.success || parsed.data.streamSid !== parsed.data.start.streamSid) {
    return null;
  }
  return parsed.data;
}

export function buildRealtimeSessionUpdate(agent: Pick<
  Agent,
  "name" | "systemPrompt" | "language" | "transferNumber"
>) {
  ensureToolsRegistered();

  const tools = listTools().map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.inputSchema as z.ZodType) as Record<string, unknown>,
  }));
  const instructions = [
    agent.systemPrompt?.trim() ||
      `You are ${agent.name}, a helpful phone assistant.`,
    "You are speaking on a live phone call. Keep responses natural, clear, and concise.",
    "At the beginning of the call, greet the caller briefly and ask how you can help.",
    "Use the available functions to perform actions. Never claim an action succeeded unless its function result confirms success.",
    "If you do not know an answer, say so instead of guessing.",
  ].join("\n\n");

  return {
    type: "session.update" as const,
    session: {
      type: "realtime" as const,
      model: process.env.OPENAI_REALTIME_MODEL || DEFAULT_REALTIME_MODEL,
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcmu" },
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: agent.language,
          },
          turn_detection: { type: "server_vad" },
        },
        output: {
          format: { type: "audio/pcmu" },
          voice: DEFAULT_REALTIME_VOICE,
        },
      },
      instructions,
      tools,
      tool_choice: "auto",
    },
  };
}
