import * as z from "zod";

export const createAgentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Agent name must be at least 2 characters.")
    .max(100, "Agent name must be under 100 characters."),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const updateAgentConfigSchema = z.object({
  systemPrompt: z
    .string()
    .trim()
    .max(4000, "System prompt must be under 4000 characters.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  transferNumber: z
    .string()
    .trim()
    .regex(E164_REGEX, "Enter the transfer number in E.164 format, e.g. +14155551234.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type UpdateAgentConfigInput = z.infer<typeof updateAgentConfigSchema>;
