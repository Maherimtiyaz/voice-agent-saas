import * as z from "zod";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const createPhoneNumberSchema = z.object({
  twilioNumberSid: z
    .string()
    .trim()
    .min(10, "That doesn't look like a Twilio phone number SID.")
    .startsWith("PN", "A Twilio phone number SID starts with \"PN\"."),
  e164Number: z
    .string()
    .trim()
    .regex(E164_REGEX, "Enter the number in E.164 format, e.g. +14155551234."),
  vapiPhoneNumberId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  agentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type CreatePhoneNumberInput = z.infer<typeof createPhoneNumberSchema>;

export const assignAgentSchema = z.object({
  phoneNumberId: z.string().uuid(),
  agentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type AssignAgentInput = z.infer<typeof assignAgentSchema>;
