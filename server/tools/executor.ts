import type { Database } from "@/db";
import { toolExecutions } from "@/db/schema";
import { getTool } from "@/server/tools/registry";
import type { ToolContext, ToolResult } from "@/server/tools/types";
import { setCallOutcome } from "@/server/services/call.service";

/**
 * The single choke point every tool call goes through. This is what
 * "the LLM must never receive unrestricted database access" actually
 * means in code: the LLM only ever produces a (toolName, rawInput) pair
 * over the Vapi tool-calls webhook; this function is the only thing
 * that turns that into a database operation, and it always:
 *
 *   1. looks the tool up by name (an unknown name is a clean failure,
 *      not a crash)
 *   2. validates rawInput against that tool's zod schema (a schema
 *      violation never reaches the handler)
 *   3. runs the handler with the trusted, upstream-resolved
 *      ToolContext — never anything the caller supplied
 *   4. logs exactly what happened (input, output or error, duration,
 *      success/failure) to tool_executions, before returning
 *
 * A thrown error from the handler is caught here and turned into a
 * generic failure result — the caller (the Vapi webhook route) never
 * sees a raw exception, and nothing internal (stack traces, SQL, etc.)
 * is ever put in the string handed back to the LLM.
 */
export async function executeTool(
  db: Database,
  params: { toolName: string; rawInput: unknown; context: ToolContext },
): Promise<ToolResult> {
  const startedAt = Date.now();
  const tool = getTool(params.toolName);

  if (!tool) {
    return logAndReturn(db, params, startedAt, {
      success: false,
      error: `Unknown tool "${params.toolName}".`,
    });
  }

  const parsed = tool.inputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return logAndReturn(db, params, startedAt, {
      success: false,
      error: `Invalid input for "${params.toolName}": ${parsed.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    });
  }

  try {
    const result = await tool.handler(db, parsed.data, params.context);
    if (result.success && result.outcome) {
      // Best-effort: an outcome-write failure must not undo an
      // otherwise-successful tool call or block its result reaching the LLM.
      try {
        await setCallOutcome(db, { callId: params.context.callId, outcome: result.outcome });
      } catch (outcomeError) {
        console.error(`[tools] failed to set call outcome for ${params.toolName}`, outcomeError);
      }
    }
    return logAndReturn(db, params, startedAt, result);
  } catch (error) {
    console.error(`[tools] ${params.toolName} threw`, error);
    return logAndReturn(db, params, startedAt, {
      success: false,
      error: "This action couldn't be completed right now.",
    });
  }
}

async function logAndReturn(
  db: Database,
  params: { toolName: string; rawInput: unknown; context: ToolContext },
  startedAt: number,
  result: ToolResult,
): Promise<ToolResult> {
  const durationMs = Date.now() - startedAt;
  try {
    await db.insert(toolExecutions).values({
      organizationId: params.context.organizationId,
      agentId: params.context.agentId,
      callId: params.context.callId,
      toolName: params.toolName,
      input: safeJsonRecord(params.rawInput),
      output: result.success ? safeJsonRecord(result.data) : null,
      status: result.success ? "success" : "failure",
      error: result.success ? null : result.error,
      durationMs,
    });
  } catch (loggingError) {
    // Logging must never be the reason a tool call fails outright —
    // the LLM still gets its result even if the audit row didn't write.
    console.error(`[tools] failed to log execution of ${params.toolName}`, loggingError);
  }
  return result;
}

function safeJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}
