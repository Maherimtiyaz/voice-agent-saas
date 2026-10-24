import * as z from "zod";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Enter a campaign name.").max(120),
  agentId: z.string().uuid("Choose an agent."),
  phoneNumberId: z.string().uuid("Choose a caller ID."),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const addCampaignContactsSchema = z.object({
  campaignId: z.string().uuid(),
  phoneNumbers: z
    .string()
    .trim()
    .min(1, "Enter at least one phone number.")
    .max(50_000)
    .transform((value) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    .refine((numbers) => numbers.length <= 500, "Add no more than 500 numbers at a time.")
    .refine(
      (numbers) => numbers.every((number) => E164_REGEX.test(number)),
      "Enter one phone number per line in E.164 format, e.g. +14155551234.",
    ),
  consentConfirmed: z.preprocess((value) => value === "on", z.literal(true, {
    error: "Confirm that every contact has consented to receive calls.",
  })),
});

export type AddCampaignContactsInput = z.infer<typeof addCampaignContactsSchema>;

/**
 * Scheduler settings. An empty `scheduledAt` means "do not start by
 * itself" — the campaign stays a draft until a member starts it.
 *
 * The pacing floor of 10 seconds is deliberate: a campaign that calls
 * hundreds of numbers back-to-back is indistinguishable from a
 * robocaller, which is how a Twilio number gets flagged.
 */
export const scheduleCampaignSchema = z.object({
  campaignId: z.string().uuid(),
  scheduledAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? new Date(value) : null))
    .refine(
      (value) => value === null || !Number.isNaN(value.getTime()),
      "Enter a valid start time.",
    ),
  dispatchIntervalSeconds: z.coerce
    .number()
    .int()
    .min(10, "Leave at least 10 seconds between calls.")
    .max(86_400, "The longest supported interval is 24 hours."),
  maxAttempts: z.coerce
    .number()
    .int()
    .min(1, "Allow at least one attempt.")
    .max(10, "Allow no more than 10 attempts per contact."),
});

export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;
