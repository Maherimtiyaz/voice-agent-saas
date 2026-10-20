import { eq } from "drizzle-orm";
import { z } from "zod";
import { agents } from "@/db/schema";
import { summarizeCallForHandoff } from "@/server/integrations/openai/handoff-summary";
import { getCallForTool } from "@/server/tools/helpers";
import { transferLiveCall } from "@/server/integrations/twilio/transfer";
import {
  createCallHandoff,
  finishCallHandoff,
  getHandoffTranscripts,
} from "@/server/services/handoff.service";
import type { ToolDefinition } from "@/server/tools/types";

const inputSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const transferCallTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "transfer_call",
  description:
    "Transfer the current call to a human. The destination is a pre-approved number configured for this agent — it cannot be chosen at call time, only whether to transfer and (optionally) why.",
  inputSchema,
  async handler(db, input, context) {
    const [agent] = await db
      .select({ transferNumber: agents.transferNumber })
      .from(agents)
      .where(eq(agents.id, context.agentId))
      .limit(1);

    if (!agent?.transferNumber) {
      return {
        success: false,
        error: "No transfer number is configured for this agent.",
      };
    }

    const call = await getCallForTool(db, {
      organizationId: context.organizationId,
      callId: context.callId,
    });
    if (!call) {
      return { success: false, error: "Could not resolve this call." };
    }
    if (!call.twilioCallSid) {
      return {
        success: false,
        error: "Call transfer is unavailable for outbound campaign calls.",
      };
    }

    const transcripts = await getHandoffTranscripts(db, call.id);
    const summary = await summarizeCallForHandoff(transcripts, input.reason);
    const handoff = await createCallHandoff(db, {
      organizationId: context.organizationId,
      callId: call.id,
      destinationNumber: agent.transferNumber,
      reason: input.reason,
      summary,
    });

    try {
      await transferLiveCall({
        twilioCallSid: call.twilioCallSid,
        destinationNumber: agent.transferNumber,
        handoffId: handoff.id,
        announcement: "Please hold while I transfer your call.",
      });
      return {
        success: true,
        outcome: "transferred_to_human",
        data: { transferred: true, handoffId: handoff.id },
      };
    } catch (error) {
      try {
        await finishCallHandoff(db, {
          handoffId: handoff.id,
          twilioCallSid: call.twilioCallSid,
          status: "failed",
        });
      } catch (persistenceError) {
        console.error("[tools/transfer_call] failed to record handoff failure", persistenceError);
      }
      console.error("[tools/transfer_call] Twilio transfer failed", error);
      return { success: false, error: "Couldn't transfer the call right now." };
    }
  },
};
