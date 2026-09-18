import { z } from "zod";
import { getAvailableSlots } from "@/server/services/appointment.service";
import type { ToolDefinition } from "@/server/tools/types";

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  durationMinutes: z.number().int().min(15).max(240).optional().default(30),
});

export const checkAvailabilityTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "check_availability",
  description:
    "Check available appointment slots on a given date (YYYY-MM-DD), within standard business hours (9am-5pm). Returns a list of ISO 8601 start times.",
  inputSchema,
  async handler(db, input, context) {
    const slots = await getAvailableSlots(db, {
      organizationId: context.organizationId,
      dateOnly: input.date,
      durationMinutes: input.durationMinutes,
    });

    return {
      success: true,
      data: {
        date: input.date,
        durationMinutes: input.durationMinutes,
        availableSlots: slots.map((slot) => slot.toISOString()),
      },
    };
  },
};
