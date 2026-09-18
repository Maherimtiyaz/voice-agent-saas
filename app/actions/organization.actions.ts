"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { createSessionCookie } from "@/lib/session";
import { requireCurrentUser } from "@/server/auth/current-user";
import { requireMembership } from "@/server/services/organization.service";

/**
 * Switches which organization the session is "acting as". Re-checks
 * membership server-side rather than trusting the submitted id, so a
 * tampered form can't switch a user into an org they don't belong to.
 */
export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organizationId");
  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return;
  }

  const user = await requireCurrentUser();
  await requireMembership(db, { organizationId, userId: user.id });

  await createSessionCookie({ userId: user.id, activeOrganizationId: organizationId });
  redirect("/dashboard");
}
