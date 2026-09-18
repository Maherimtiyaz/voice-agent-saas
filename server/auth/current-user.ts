import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { readSessionCookie } from "@/lib/session";
import {
  listUserOrganizations,
  requireMembership,
} from "@/server/services/organization.service";
import type { MemberRole } from "@/db/schema";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Reads and validates the session cookie for the current request, then
 * loads the user it points at. Wrapped in React's `cache()` so multiple
 * Server Components rendering in the same request share one DB lookup
 * instead of each re-fetching it.
 *
 * Returns `null` for "not signed in" rather than redirecting — callers
 * that require auth should use `requireCurrentUser()` instead, so that
 * layouts which merely *display* user info (and might render for both
 * signed-in and signed-out states) aren't forced into a redirect.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSessionCookie();
  if (!session) return null;

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
});

/** Same session read, without the DB round-trip — for the active org id only. */
export const getActiveOrganizationId = cache(async (): Promise<string | null> => {
  const session = await readSessionCookie();
  return session?.activeOrganizationId ?? null;
});

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export interface CurrentContext {
  user: CurrentUser;
  organizationId: string;
  role: MemberRole;
}

/**
 * The main guard for any dashboard page or Server Action: resolves who's
 * signed in AND which organization they're acting in, and throws/redirects
 * if either is missing or the membership doesn't hold up. Use this instead
 * of trusting an `organizationId` passed up from the client.
 */
export async function requireCurrentContext(
  allowedRoles?: MemberRole[],
): Promise<CurrentContext> {
  const user = await requireCurrentUser();
  const organizationId = await getActiveOrganizationId();

  if (!organizationId) {
    redirect("/login");
  }

  const role = await requireMembership(db, {
    organizationId,
    userId: user.id,
    allowedRoles,
  });

  return { user, organizationId, role };
}

export async function getCurrentUserOrganizations(userId: string) {
  return listUserOrganizations(db, userId);
}
