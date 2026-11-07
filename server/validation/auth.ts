import * as z from "zod";
import { emailSchema } from "@/server/validation/email";

/**
 * bcrypt only reads the first 72 BYTES of a password. Anything longer is
 * silently truncated, so two different 100-character passwords that share a
 * 72-byte prefix would authenticate interchangeably. Hashing an unbounded
 * string is also cheap CPU exhaustion on a public endpoint. Cap it and say
 * exactly why.
 *
 * The byte check matters for non-ASCII passwords: `.max(72)` counts
 * characters, and 72 emoji are 288 bytes.
 */
const PASSWORD_MAX_LENGTH = 72;
const PASSWORD_MAX_BYTES = 72;

function exceedsBcryptLimit(value: string): boolean {
  return new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES;
}

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(PASSWORD_MAX_LENGTH, "Password must be 72 characters or fewer.")
  .refine((value) => !exceedsBcryptLimit(value), {
    message: "Password must be 72 bytes or fewer (use a shorter password).",
  })
  .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: emailSchema(),
  password: passwordSchema,
  organizationName: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters."),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema(),
  // A longer password can never match a bcrypt hash; reject it before
  // spending a comparison and before bcrypt silently truncates it.
  password: z
    .string()
    .min(1, "Password is required.")
    .max(PASSWORD_MAX_LENGTH, "Password is too long."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const inviteRegistrationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This invitation link is invalid."),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  password: passwordSchema,
});

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const forgotPasswordSchema = z.object({
  email: emailSchema(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This password reset link is invalid."),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
