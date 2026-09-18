import { eq } from "drizzle-orm";
import { z } from "zod";
import { agents } from "@/db/schema";
import { getCallForTool } from "@/server/tools/helpers";
import { transferLiveCall } from "@/server/integrations/twilio/transfer";
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

    try {
      await transferLiveCall({
        twilioCallSid: call.twilioCallSid,
        destinationNumber: agent.transferNumber,
        announcement: "Please hold while I transfer your call.",
      });
      return { success: true, outcome: "transferred_to_human", data: { transferred: true, reason: input.reason } };
    } catch (error) {
      console.error("[tools/transfer_call] Twilio transfer failed", error);
      return { success: false, error: "Couldn't transfer the call right now." };
    }
  },
};
