"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import { createSessionCookie } from "@/lib/session";
import { requireCurrentContext, requireCurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { isEmailConfigured } from "@/server/integrations/email/client";
import {
  acceptOrganizationInvite,
  createOrganizationInvite,
  registerAndAcceptOrganizationInvite,
  revokeOrganizationInvite,
} from "@/server/services/organization-invite.service";
import {
  inviteRegistrationSchema,
  inviteTokenSchema,
} from "@/server/validation/auth";
import { emailSchema } from "@/server/validation/email";

const createInviteSchema = z.object({
  email: emailSchema(),
  role: z.enum(["admin", "member"]),
});

export interface OrganizationInviteActionState {
  errors?: Record<string, string[]>;
  message?: string;
  inviteUrl?: string;
  /** True when the invitation email was queued for delivery. */
  emailed?: boolean;
}

function inviteBaseUrl(): string | null {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function createOrganizationInviteAction(
  _previous: OrganizationInviteActionState | undefined,
  formData: FormData,
): Promise<OrganizationInviteActionState> {
  const validated = createInviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") ?? "member",
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext(["owner", "admin"]);
  const baseUrl = inviteBaseUrl();
  if (!baseUrl) {
    return { message: "APP_URL must be configured with the public application origin before creating invites." };
  }

  // An email provider is optional. When one is configured the invite
  // email is queued automatically; when it is not, the admin still
  // gets a copyable link and the old manual flow is unchanged.
  const canEmail = isEmailConfigured();

  try {
    const created = await createOrganizationInvite(db, {
      organizationId,
      userId: user.id,
      email: validated.data.email,
      role: validated.data.role,
      appUrl: canEmail ? baseUrl : null,
    });
    revalidatePath("/settings");
    return {
      inviteUrl: new URL(`/invite/${created.token}`, baseUrl).toString(),
      emailed: canEmail,
      message: canEmail
        ? "Invitation created and emailed. The link below is shown once in case you need to resend it."
        : "Invitation created. Copy the link and send it to the invited person; it expires in 7 days.",
    };
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }
}

export async function revokeOrganizationInviteAction(formData: FormData): Promise<void> {
  const inviteId = formData.get("inviteId");
  if (typeof inviteId !== "string" || !z.uuid().safeParse(inviteId).success) {
    throw new Error("Invalid invitation id.");
  }

  const { user, organizationId } = await requireCurrentContext(["owner", "admin"]);
  await revokeOrganizationInvite(db, { organizationId, userId: user.id, inviteId });
  revalidatePath("/settings");
}

export async function acceptOrganizationInviteAction(
  _previous: OrganizationInviteActionState | undefined,
  formData: FormData,
): Promise<OrganizationInviteActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || !inviteTokenSchema.safeParse(token).success) {
    return { message: "This invitation link is invalid." };
  }

  const user = await requireCurrentUser();
  try {
    const { organizationId } = await acceptOrganizationInvite(db, {
      token,
      userId: user.id,
      userEmail: user.email,
    });
    await createSessionCookie({ userId: user.id, activeOrganizationId: organizationId });
    redirect("/dashboard");
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }
}

export async function registerAndAcceptOrganizationInviteAction(
  _previous: OrganizationInviteActionState | undefined,
  formData: FormData,
): Promise<OrganizationInviteActionState> {
  const validated = inviteRegistrationSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  try {
    const accepted = await registerAndAcceptOrganizationInvite(db, validated.data);
    await createSessionCookie({
      userId: accepted.user.id,
      activeOrganizationId: accepted.organizationId,
    });
    redirect("/dashboard");
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }
}
