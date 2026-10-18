import { z } from "zod";
import { findCustomerByPhone } from "@/server/services/customer.service";
import type { ToolDefinition } from "@/server/tools/types";

const inputSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "phone must be in E.164 format, e.g. +14155551234"),
});

export const getCustomerTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "get_customer",
  description:
    "Look up a customer by phone number in this business's records and connected HubSpot account. A HubSpot contact is added to the business's records when first found. Returns found:false if no customer exists in either place.",
  inputSchema,
  async handler(db, input, context) {
    const customer = await findCustomerByPhone(db, {
      organizationId: context.organizationId,
      phone: input.phone,
    });

    if (!customer) {
      return { success: true, data: { found: false } };
    }

    return {
      success: true,
      data: {
        found: true,
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    };
  },
};
