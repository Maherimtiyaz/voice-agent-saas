import { z } from "zod";
import { findCustomerByPhone } from "@/server/services/customer.service";
import { createJob } from "@/server/services/job.service";
import type { ToolDefinition } from "@/server/tools/types";

const inputSchema = z.object({
  customerPhone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, "customerPhone must be in E.164 format, e.g. +14155551234"),
  description: z.string().min(1).max(2000),
  appointmentId: z.uuid().optional(),
});

export const createJobTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "create_job",
  description:
    "Create an internal job/work-order record for an existing customer, optionally linked to a booked appointment. The customer must already exist (call get_customer or create_customer first).",
  inputSchema,
  async handler(db, input, context) {
    const customer = await findCustomerByPhone(db, {
      organizationId: context.organizationId,
      phone: input.customerPhone,
    });

    if (!customer) {
      return {
        success: false,
        error: "No customer found with that phone number — create the customer first.",
      };
    }

    const result = await createJob(db, {
      organizationId: context.organizationId,
      customerId: customer.id,
      description: input.description,
      appointmentId: input.appointmentId,
    });

    if (!result.created) {
      return {
        success: false,
        error: "That appointment could not be found for this business.",
      };
    }

    return { success: true, outcome: "job_created", data: { jobId: result.job.id, status: result.job.status } };
  },
};
