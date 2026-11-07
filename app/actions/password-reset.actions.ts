"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getClientIp } from "@/lib/client-ip";
import { AppError } from "@/server/errors";
import {
  requestPasswordReset,
  resetPassword,
} from "@/server/services/password-reset.service";
import { consumeRateLimit } from "@/server/services/rate-limit.service";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/server/validation/auth";

export interface PasswordResetActionState {
  errors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
}

async function clientIp(): Promise<string> {
  return getClientIp(await headers());
}

function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export async function requestPasswordResetAction(
  _previous: PasswordResetActionState | undefined,
  formData: FormData,
): Promise<PasswordResetActionState> {
  const validated = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const [emailLimit, ipLimit] = await Promise.all([
    consumeRateLimit(db, {
      bucket: "auth_password_reset",
      key: validated.data.email,
    }),
    consumeRateLimit(db, {
      bucket: "auth_password_reset",
      key: await clientIp(),
      variant: "ip",
    }),
  ]);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    return {
      message: rateLimitMessage(
        Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds),
      ),
    };
  }

  try {
    await requestPasswordReset(db, validated.data);
  } catch (error) {
    // The service deliberately swallows "unknown email" and delivery
    // failures, so an AppError here is a real problem. Never forward a
    // driver/provider message to the public.
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }

  // The same response whether or not the address exists: this is the
  // anti-enumeration property the whole flow is built around.
  return {
    success: true,
    message:
      "If an account exists for that email, a reset link is on its way. It expires in one hour.",
  };
}

export async function resetPasswordAction(
  _previous: PasswordResetActionState | undefined,
  formData: FormData,
): Promise<PasswordResetActionState> {
  const validated = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Rate limit token guessing by IP. The key is deliberately the IP, not
  // the token: rate_limit_counters must never contain a usable secret.
  const ipLimit = await consumeRateLimit(db, {
    bucket: "auth_password_reset",
    key: await clientIp(),
    variant: "ip",
  });
  if (!ipLimit.allowed) {
    return { message: rateLimitMessage(ipLimit.retryAfterSeconds) };
  }

  try {
    await resetPassword(db, validated.data);
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }

  redirect("/login?reset=1");
}
