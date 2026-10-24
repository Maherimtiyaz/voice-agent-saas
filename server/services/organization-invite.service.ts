import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import {
  organizationInvites,
  organizationMembers,
  organizations,
  users,
} from "@/db/schema";
import type { MemberRole } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { isUniqueViolation } from "@/server/db-errors";
import {
  ConflictError,
  EmailTakenError,
  InsufficientRoleError,
  InvitationEmailMismatchError,
  InvalidInvitationError,
} from "@/server/errors";
import { requireMembership } from "@/server/services/organization.service";
import { queueEmail } from "@/server/services/email-outbox.service";

const INVITE_LIFETIME_DAYS = 7;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface PendingOrganizationInvite {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: Date;
  expiresAt: Date;
}

export async function createOrganizationInvite(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    email: string;
    role: "admin" | "member";
    /**
     * The public origin of this app, used to build the invite link
     * that goes into the email body. Omit it (or pass null) to skip
     * queueing an email — the link is then only available to copy
     * manually, which is what happens when no email provider is
     * configured.
     */
    appUrl?: string | null;
  },
): Promise<{ inviteId: string; token: string; expiresAt: Date }> {
  const actualRole = await requireMembership(db, {
    organizationId: params.organizationId,
    userId: params.userId,
    allowedRoles: ["owner", "admin"],
  });
  if (params.role === "admin" && actualRole !== "owner") {
    throw new InsufficientRoleError();
  }

  const email = normalizeEmail(params.email);
  const [existingMember] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(
      and(
        eq(organizationMembers.organizationId, params.organizationId),
        eq(users.email, email),
      ),
    )
    .limit(1);
  if (existingMember) {
    throw new ConflictError("That person is already a member of this workspace.");
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const tokenHash = hashInviteToken(token);

  let invite: { id: string; expiresAt: Date };
  try {
    [invite] = await db.transaction(async (tx) => {
      await tx
        .update(organizationInvites)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(organizationInvites.organizationId, params.organizationId),
            eq(organizationInvites.email, email),
            isNull(organizationInvites.acceptedAt),
            isNull(organizationInvites.revokedAt),
          ),
        );

      const created = await tx
        .insert(organizationInvites)
        .values({
          organizationId: params.organizationId,
          invitedByUserId: params.userId,
          email,
          role: params.role,
          tokenHash,
          expiresAt,
        })
        .returning({ id: organizationInvites.id, expiresAt: organizationInvites.expiresAt });

      // The email is queued in the SAME transaction as the invite, so
      // we can never end up with an invite that exists but was never
      // queued for delivery (or the reverse).
      const appUrl = params.appUrl?.trim();
      if (appUrl) {
        const inviteUrl = `${appUrl.replace(/\/$/, "")}/invite/${token}`;
        await queueEmail(tx, {
          organizationId: params.organizationId,
          to: email,
          subject: `You've been invited to join a workspace`,
          body: buildInvitationEmailBody({
            inviteUrl,
            organizationName: await organizationName(tx, params.organizationId),
            role: params.role,
            expiresAt,
          }),
          kind: "organization_invite",
        });
      }

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A pending invitation was just created for this email. Refresh and try again.");
    }
    throw error;
  }

  return { inviteId: invite.id, token, expiresAt: invite.expiresAt };
}

async function organizationName(db: Database, organizationId: string): Promise<string> {
  const [row] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row?.name ?? "a workspace";
}

function buildInvitationEmailBody(params: {
  inviteUrl: string;
  organizationName: string;
  role: MemberRole;
  expiresAt: Date;
}): string {
  const expiry = params.expiresAt.toISOString().slice(0, 10);
  return [
    `You have been invited to join ${params.organizationName} as a ${params.role}.`,
    "",
    `Accept the invitation: ${params.inviteUrl}`,
    "",
    `This link expires on ${expiry}. If you were not expecting this invitation, you can ignore this email.`,
  ].join("\n");
}

export async function listPendingOrganizationInvites(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<PendingOrganizationInvite[]> {
  await requireMembership(db, {
    organizationId: params.organizationId,
    userId: params.userId,
    allowedRoles: ["owner", "admin"],
  });
  const now = new Date();
  return db
    .select({
      id: organizationInvites.id,
      email: organizationInvites.email,
      role: organizationInvites.role,
      createdAt: organizationInvites.createdAt,
      expiresAt: organizationInvites.expiresAt,
    })
    .from(organizationInvites)
    .where(
      and(
        eq(organizationInvites.organizationId, params.organizationId),
        isNull(organizationInvites.acceptedAt),
        isNull(organizationInvites.revokedAt),
        gt(organizationInvites.expiresAt, now),
      ),
    )
    .orderBy(organizationInvites.createdAt);
}

export async function revokeOrganizationInvite(
  db: Database,
  params: { organizationId: string; userId: string; inviteId: string },
): Promise<void> {
  await requireMembership(db, {
    organizationId: params.organizationId,
    userId: params.userId,
    allowedRoles: ["owner", "admin"],
  });
  const [revoked] = await db
    .update(organizationInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(organizationInvites.id, params.inviteId),
        eq(organizationInvites.organizationId, params.organizationId),
        isNull(organizationInvites.acceptedAt),
        isNull(organizationInvites.revokedAt),
      ),
    )
    .returning({ id: organizationInvites.id });

  if (!revoked) {
    throw new InvalidInvitationError();
  }
}

export async function getOrganizationInviteByToken(db: Database, token: string) {
  const [invite] = await db
    .select({
      id: organizationInvites.id,
      organizationId: organizationInvites.organizationId,
      organizationName: organizations.name,
      email: organizationInvites.email,
      role: organizationInvites.role,
      expiresAt: organizationInvites.expiresAt,
    })
    .from(organizationInvites)
    .innerJoin(organizations, eq(organizationInvites.organizationId, organizations.id))
    .where(
      and(
        eq(organizationInvites.tokenHash, hashInviteToken(token)),
        isNull(organizationInvites.acceptedAt),
        isNull(organizationInvites.revokedAt),
        gt(organizationInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return invite ?? null;
}

export async function acceptOrganizationInvite(
  db: Database,
  params: { token: string; userId: string; userEmail: string },
): Promise<{ organizationId: string }> {
  const tokenHash = hashInviteToken(params.token);
  const email = normalizeEmail(params.userEmail);

  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.tokenHash, tokenHash),
          isNull(organizationInvites.acceptedAt),
          isNull(organizationInvites.revokedAt),
          gt(organizationInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!invite) throw new InvalidInvitationError();
    if (invite.email !== email) throw new InvitationEmailMismatchError();

    const [membership] = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.userId, params.userId),
        ),
      )
      .limit(1);
    if (membership) {
      throw new ConflictError("You are already a member of this workspace.");
    }

    const [accepted] = await tx
      .update(organizationInvites)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(organizationInvites.id, invite.id),
          isNull(organizationInvites.acceptedAt),
          isNull(organizationInvites.revokedAt),
          gt(organizationInvites.expiresAt, new Date()),
        ),
      )
      .returning({ id: organizationInvites.id });
    if (!accepted) throw new InvalidInvitationError();

    await tx.insert(organizationMembers).values({
      organizationId: invite.organizationId,
      userId: params.userId,
      role: invite.role,
    });
    return { organizationId: invite.organizationId };
  });
}

export async function registerAndAcceptOrganizationInvite(
  db: Database,
  params: {
    token: string;
    name: string;
    password: string;
  },
): Promise<{ user: { id: string; email: string; name: string }; organizationId: string }> {
  const tokenHash = hashInviteToken(params.token);
  const passwordHash = await hashPassword(params.password);

  try {
    return await db.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(organizationInvites)
        .where(
          and(
            eq(organizationInvites.tokenHash, tokenHash),
            isNull(organizationInvites.acceptedAt),
            isNull(organizationInvites.revokedAt),
            gt(organizationInvites.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!invite) throw new InvalidInvitationError();

      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, invite.email))
        .limit(1);
      if (existingUser) throw new EmailTakenError();

      const [user] = await tx
        .insert(users)
        .values({ email: invite.email, name: params.name.trim(), passwordHash })
        .returning({ id: users.id, email: users.email, name: users.name });

      const [accepted] = await tx
        .update(organizationInvites)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(organizationInvites.id, invite.id),
            isNull(organizationInvites.acceptedAt),
            isNull(organizationInvites.revokedAt),
            gt(organizationInvites.expiresAt, new Date()),
          ),
        )
        .returning({ id: organizationInvites.id });
      if (!accepted) throw new InvalidInvitationError();

      await tx.insert(organizationMembers).values({
        organizationId: invite.organizationId,
        userId: user.id,
        role: invite.role,
      });
      return { user, organizationId: invite.organizationId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError();
    throw error;
  }
}
