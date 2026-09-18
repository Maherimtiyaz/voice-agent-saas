import type { z } from "zod";
import type { Database } from "@/db";
import type { CallOutcome } from "@/db/schema";

/**
 * Everything a tool handler is allowed to know about "who is calling".
 * This is NEVER built from anything the LLM/tool-call payload supplies —
 * it's resolved once, upstream, from the already-authenticated call row
 * (organizationId/agentId were established at call-start time via the
 * Twilio-webhook -> phone_numbers -> agents lookup chain; see
 * server/services/phone-number.service.ts). A tool handler that needs
 * "which organization" or "which agent" reads it from here, not from its
 * own input — that's what makes it impossible for the LLM to reach
 * another organization's data by supplying a different id in an argument.
 */
export interface ToolContext {
  organizationId: string;
  agentId: string;
  callId: string;
}

export type ToolResult<TOutput = unknown> =
  | { success: true; data: TOutput; outcome?: CallOutcome }
  // `outcome`, when present, is written to `calls.outcome` by the
  // executor — a business-outcome summary, distinct from call
  // lifecycle status. Only set it when the tool actually achieved that
  // outcome (e.g. book_appointment must NOT set it when the slot turned
  // out to be unavailable — that's still success:true, just no outcome).
  | { success: false; error: string };

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  /**
   * Runs the tool. Receives the already-validated input and the trusted
   * context above, plus the database to operate against (injected, same
   * pattern as the rest of the service layer — this is what makes
   * individual tools unit-testable against pglite without an HTTP
   * request). Handlers are expected to scope every query by
   * `context.organizationId` themselves — the executor validates input
   * and logs the outcome, but does NOT know enough about any specific
   * tool's data model to authorize on its behalf beyond that.
   */
  handler: (db: Database, input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
}
