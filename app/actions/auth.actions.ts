"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { createSessionCookie, deleteSessionCookie } from "@/lib/session";
import { AppError } from "@/server/errors";
import { authenticateUser, registerUser } from "@/server/services/auth.service";
import { listUserOrganizations } from "@/server/services/organization.service";
import { loginSchema, registerSchema } from "@/server/validation/auth";

export interface AuthFormState {
  errors?: Record<string, string[]>;
  message?: string;
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
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await deleteSessionCookie();
  redirect("/login");
}
