import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { phoneNumbers } from "@/db/schema";
import { toolExecutions } from "@/db/schema";
import { getCallForTool } from "@/server/tools/helpers";
import { sendSms } from "@/server/integrations/twilio/sms";
import type { ToolDefinition } from "@/server/tools/types";

// A runaway/prompt-injected conversation must not be able to blast SMS
// out from the organization's number indefinitely — cap it per call.
const MAX_SMS_PER_CALL = 3;

const inputSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{1,14}$/, "to must be in E.164 format, e.g. +14155551234"),
  body: z.string().min(1).max(480),
});

export const sendSmsTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "send_sms",
  description:
    "Send a text message from this business's phone number. Limited to a small number of messages per call to prevent misuse.",
  inputSchema,
  async handler(db, input, context) {
    const call = await getCallForTool(db, {
      organizationId: context.organizationId,
      callId: context.callId,
    });
    if (!call) {
      return { success: false, error: "Could not resolve this call." };
    }

    const [{ value: sentThisCall }] = await db
      .select({ value: count() })
      .from(toolExecutions)
      .where(
        and(
          eq(toolExecutions.callId, context.callId),
          eq(toolExecutions.toolName, "send_sms"),
          eq(toolExecutions.status, "success"),
        ),
      );

    if (sentThisCall >= MAX_SMS_PER_CALL) {
      return { success: false, error: "SMS limit reached for this call." };
    }

    const [phoneNumber] = await db
      .select({ e164Number: phoneNumbers.e164Number })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.id, call.phoneNumberId))
      .limit(1);
    if (!phoneNumber) {
      return { success: false, error: "This business has no sender number configured." };
    }

    try {
      const result = await sendSms({ to: input.to, from: phoneNumber.e164Number, body: input.body });
      return { success: true, outcome: "sms_sent", data: { messageSid: result.messageSid, status: result.status } };
    } catch (error) {
      console.error("[tools/send_sms] Twilio send failed", error);
      return { success: false, error: "Couldn't send the text message right now." };
    }
  },
};
