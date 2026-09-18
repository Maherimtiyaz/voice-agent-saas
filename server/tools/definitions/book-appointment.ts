import { z } from "zod";
import { upsertCustomer } from "@/server/services/customer.service";
import { bookAppointment } from "@/server/services/appointment.service";
import type { ToolDefinition } from "@/server/tools/types";

const inputSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerPhone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, "customerPhone must be in E.164 format, e.g. +14155551234"),
  scheduledAt: z.iso.datetime({ message: "scheduledAt must be an ISO 8601 datetime" }),
  durationMinutes: z.number().int().min(15).max(240).optional().default(30),
});

export const bookAppointmentTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "book_appointment",
  description:
    "Book an appointment for a customer at a specific date/time. Creates the customer record if one doesn't already exist for that phone number. Fails safely with booked:false if the slot is no longer available — call check_availability again in that case.",
  inputSchema,
  async handler(db, input, context) {
    const { customer } = await upsertCustomer(db, {
      organizationId: context.organizationId,
      name: input.customerName,
      phone: input.customerPhone,
    });

    const result = await bookAppointment(db, {
      organizationId: context.organizationId,
      agentId: context.agentId,
      callId: context.callId,
      customerId: customer.id,
      scheduledAt: new Date(input.scheduledAt),
      durationMinutes: input.durationMinutes,
    });

    if (!result.booked) {
      return {
        success: true,
        data: { booked: false, reason: result.reason },
      };
    }

    return {
      success: true,
      outcome: "appointment_booked",
      data: {
        booked: true,
        appointmentId: result.appointment.id,
        scheduledAt: result.appointment.scheduledAt.toISOString(),
        durationMinutes: result.appointment.durationMinutes,
      },
    };
  },
};
