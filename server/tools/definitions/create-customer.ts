import { z } from "zod";
import { upsertCustomer } from "@/server/services/customer.service";
import type { ToolDefinition } from "@/server/tools/types";

const inputSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "phone must be in E.164 format, e.g. +14155551234"),
  email: z.email().optional(),
});

export const createCustomerTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "create_customer",
  description:
    "Create a new customer record for this business. If a customer with this phone number already exists, returns the existing record instead of creating a duplicate.",
  inputSchema,
  async handler(db, input, context) {
    const { customer, created } = await upsertCustomer(db, {
      organizationId: context.organizationId,
      name: input.name,
      phone: input.phone,
      email: input.email,
    });

    return {
      success: true,
      data: { customerId: customer.id, created },
    };
  },
};
