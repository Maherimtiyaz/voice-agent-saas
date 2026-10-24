"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { createSessionCookie, deleteSessionCookie } from "@/lib/session";
import { AppError } from "@/server/errors";
import { authenticateUser, registerUser } from "@/server/services/auth.service";
import { listUserOrganizations } from "@/server/services/organization.service";
import { consumeRateLimit } from "@/server/services/rate-limit.service";
import { loginSchema, registerSchema } from "@/server/validation/auth";

export interface AuthFormState {
  errors?: Record<string, string[]>;
  message?: string;
}

/**
 * The best-effort client IP, used as a secondary rate-limit key.
 *
 * See the note in app/actions/demo-request.actions.ts — this is the
 * last entry of `x-forwarded-for` (the one the platform added), used
 * only to slow down abuse, never to identify anyone.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headerList.get("x-real-ip") ?? "unknown";
}

export async function registerAction(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  const validated = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    organizationName: formData.get("organizationName"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  // Two independent limits: one on the email address being registered
  // and one on the caller's IP. Either one alone is easy to work
  // around (register many addresses, or many addresses from one
  // machine) — requiring both to be under the limit is what makes
  // bulk automated registration impractical.
  const [emailLimit, ipLimit] = await Promise.all([
    consumeRateLimit(db, { bucket: "auth_register", key: validated.data.email }),
    consumeRateLimit(db, {
      bucket: "auth_register",
      key: await clientIp(),
      variant: "ip",
    }),
  ]);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfter = Math.ceil(
      Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds) / 60,
    );
    return {
      message: `Too many registration attempts. Please try again in ${retryAfter} minute${retryAfter === 1 ? "" : "s"}.`,
    };
  }

  let organizationId: string;
  let userId: string;
  try {
    const result = await registerUser(db, validated.data);
    organizationId = result.organizationId;
    userId = result.user.id;
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    throw error;
  }

  await createSessionCookie({ userId, activeOrganizationId: organizationId });
  redirect("/dashboard");
}

export async function loginAction(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  const validated = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  // Rate limit BEFORE authenticating, so the limit covers password
  // guessing, not just successful sign-ins. The limit is on the
  // account being targeted plus the caller's IP.
  const [emailLimit, ipLimit] = await Promise.all([
    consumeRateLimit(db, { bucket: "auth_login", key: validated.data.email }),
    consumeRateLimit(db, {
      bucket: "auth_login",
      key: await clientIp(),
      variant: "ip",
    }),
  ]);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfter = Math.ceil(
      Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds) / 60,
    );
    return {
      message: `Too many sign-in attempts. Please try again in ${retryAfter} minute${retryAfter === 1 ? "" : "s"}.`,
    };
  }

  let userId: string;
  try {
    const result = await authenticateUser(db, validated.data);
    userId = result.user.id;
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    throw error;
  }

  const memberships = await listUserOrganizations(db, userId);
  const activeOrganizationId = memberships[0]?.organizationId;
  if (!activeOrganizationId) {
    // Shouldn't happen — registration always creates one — but fail
    // safely rather than issuing a session with nowhere to land.
    return { message: "Your account isn't attached to a workspace yet." };
  }

  await createSessionCookie({ userId, activeOrganizationId });
  const next = formData.get("next");
  redirect(
    typeof next === "string" && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(next)
      ? next
      : "/dashboard",
  );
}

export async function logoutAction(): Promise<void> {
  await deleteSessionCookie();
  redirect("/login");
}
