import { z } from "zod";
import type { ToolDefinition } from "@/server/tools/types";

const registry = new Map<string, ToolDefinition<never, unknown>>();

/**
 * Registers a tool. Called once per tool, at module load time, from
 * server/tools/definitions/index.ts — see that file for the full list.
 * Re-registering the same name overwrites the previous definition
 * (useful for tests that register a fake tool); there is no dynamic,
 * runtime-configurable tool registration, by design — the set of tools
 * an agent can call is fixed code, not data.
 */
export function registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
  registry.set(tool.name, tool as unknown as ToolDefinition<never, unknown>);
}

export function getTool(name: string): ToolDefinition<never, unknown> | undefined {
  return registry.get(name);
}

export function listTools(): ToolDefinition<never, unknown>[] {
  return Array.from(registry.values());
}

export interface VapiFunctionDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Builds the `tools` array for a Vapi assistant from the SAME zod
 * schemas used to validate incoming tool calls — one source of truth,
 * so the shape the LLM is told to produce can never drift from the
 * shape the server actually accepts. See
 * server/integrations/vapi/assistant.ts, which calls this when syncing
 * an agent.
 */
export function buildVapiToolDefinitions(): VapiFunctionDefinition[] {
  return listTools().map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.inputSchema as z.ZodType) as Record<string, unknown>,
    },
  }));
}
