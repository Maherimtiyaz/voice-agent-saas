import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { calls } from "@/db/schema";
import type { Call } from "@/db/schema";

/**
 * Re-checks that the call belongs to the organization in the trusted
 * ToolContext even though `callId` itself was never supplied by the
 * LLM (it comes from the webhook route's own lookup) — defense in
 * depth costs one indexed query and means a tool handler never has to
 * take that invariant on faith.
 */
export async function getCallForTool(
  db: Database,
  params: { organizationId: string; callId: string },
): Promise<Call | null> {
  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, params.callId), eq(calls.organizationId, params.organizationId)))
    .limit(1);
  return call ?? null;
}
