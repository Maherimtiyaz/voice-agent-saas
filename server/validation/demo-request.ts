import * as z from "zod";
import { emailSchema } from "@/server/validation/email";

/**
 * Validation for the public landing-page demo / early-access form.
 *
 * This is a public, unauthenticated endpoint, so the schema is
 * deliberately strict about length: every field is bounded so a
 * single submission cannot be used to push arbitrarily large blobs
 * into the database.
 */
export const demoRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(120, "Name must be 120 characters or fewer."),
  email: emailSchema(),
  company: z
    .string()
    .trim()
    .max(160, "Company name must be 160 characters or fewer.")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(40, "Phone number must be 40 characters or fewer.")
    .optional()
    .or(z.literal("")),
  useCase: z
    .string()
    .trim()
    .max(400, "Description must be 400 characters or fewer.")
    .optional()
    .or(z.literal("")),
  callVolume: z
    .string()
    .trim()
    .max(60, "Call volume must be 60 characters or fewer.")
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .trim()
    .max(2000, "Message must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  /**
   * A honeypot field. Real people never see it (it is hidden from
   * sighted users and from assistive tech) but naive bots fill in
   * every field they find. Any value here means the submission is
   * discarded.
   */
  website: z.string().max(0, "Invalid submission.").optional().or(z.literal("")),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
