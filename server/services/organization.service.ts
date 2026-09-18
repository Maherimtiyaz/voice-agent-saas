import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { organizationMembers, organizations, users } from "@/db/schema";
import type { MemberRole, Organization } from "@/db/schema";
import { NotAMemberError, InsufficientRoleError, NotFoundError } from "@/server/errors";

export interface OrganizationMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: MemberRole;
}

export interface OrganizationMemberSummary {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: Date;
}

/**
 * Every organization a user belongs to, with their role in each.
 * Drives the workspace switcher in the dashboard shell.
 */
export async function listUserOrganizations(
  db: Database,
  userId: string,
): Promise<OrganizationMembership[]> {
  const rows = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizationMembers.organizationId, organizations.id),
    )
    .where(eq(organizationMembers.userId, userId));

  return rows;
}

/**
 * Looks up a user's role in an organization without throwing —
 * callers decide whether "not a member" is an error or just `null`.
 */
export async function findMembership(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<MemberRole | null> {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, params.organizationId),
        eq(organizationMembers.userId, params.userId),
      ),
    )
    .limit(1);

  return row?.role ?? null;
}

/**
 * The core tenant-isolation guard: throws unless the user is a member
 * of the organization, and (optionally) unless their role is one of
 * `allowedRoles`. Every org-scoped mutation should call this before
 * touching the database — never trust an org id from the client alone.
 */
export async function requireMembership(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    allowedRoles?: MemberRole[];
  },
): Promise<MemberRole> {
  const role = await findMembership(db, params);
  if (!role) {
    throw new NotAMemberError();
  }
  if (params.allowedRoles && !params.allowedRoles.includes(role)) {
    throw new InsufficientRoleError();
  }
  return role;
}

/** The organization's own row (name, slug, timestamps) — for the settings page. */
export async function getOrganization(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<Organization> {
  await requireMembership(db, params);

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);

  if (!organization) {
    throw new NotFoundError("Organization");
  }

  return organization;
}

/** All members of an organization, for the settings/members list. */
export async function listOrganizationMembers(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<OrganizationMemberSummary[]> {
  await requireMembership(db, params);

  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, params.organizationId))
    .orderBy(organizationMembers.createdAt);
}
