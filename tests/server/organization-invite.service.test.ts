import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import {
  organizationInvites,
  organizationMembers,
  organizations,
  users,
} from "@/db/schema";
import {
  acceptOrganizationInvite,
  createOrganizationInvite,
  getOrganizationInviteByToken,
  listPendingOrganizationInvites,
  registerAndAcceptOrganizationInvite,
  revokeOrganizationInvite,
} from "@/server/services/organization-invite.service";
import {
  ConflictError,
  EmailTakenError,
  InsufficientRoleError,
  InvitationEmailMismatchError,
  InvalidInvitationError,
  NotAMemberError,
} from "@/server/errors";

let db: TestDatabase;

async function seedWorkspace(role: "owner" | "admin" | "member" = "owner") {
  const [organization] = await db
    .insert(organizations)
    .values({ name: "Voice Workspace", slug: `voice-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@example.com`,
      name: "Workspace Admin",
      passwordHash: "test-hash",
    })
    .returning();
  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId: user.id,
    role,
  });
  return { organization, user };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("organization invitations", () => {
  it("stores only a token hash, normalizes email, and allows the invited user to register", async () => {
    const { organization, user } = await seedWorkspace();
    const created = await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: " New.Teammate@Example.com ",
      role: "member",
    });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [storedInvite] = await db
      .select()
      .from(organizationInvites)
      .where(eq(organizationInvites.id, created.inviteId));
    expect(storedInvite.tokenHash).not.toBe(created.token);
    expect(storedInvite.email).toBe("new.teammate@example.com");
    expect(storedInvite.role).toBe("member");

    const invitation = await getOrganizationInviteByToken(db, created.token);
    expect(invitation?.organizationName).toBe(organization.name);

    const registration = await registerAndAcceptOrganizationInvite(db, {
      token: created.token,
      name: "New Teammate",
      password: "securepass1",
    });
    expect(registration.user.email).toBe("new.teammate@example.com");
    expect(registration.organizationId).toBe(organization.id);
    expect(
      await db
        .select()
        .from(organizationMembers)
        .where(
          eq(organizationMembers.userId, registration.user.id),
        ),
    ).toHaveLength(1);
    expect(await getOrganizationInviteByToken(db, created.token)).toBeNull();
  });

  it("accepts invitations for existing users only when their account email matches", async () => {
    const { organization, user } = await seedWorkspace();
    const [invitee] = await db
      .insert(users)
      .values({
        email: "invitee@example.com",
        name: "Invitee",
        passwordHash: "test-hash",
      })
      .returning();
    const invitation = await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: "invitee@example.com",
      role: "admin",
    });

    await expect(
      acceptOrganizationInvite(db, {
        token: invitation.token,
        userId: invitee.id,
        userEmail: "another@example.com",
      }),
    ).rejects.toBeInstanceOf(InvitationEmailMismatchError);

    await expect(
      acceptOrganizationInvite(db, {
        token: invitation.token,
        userId: invitee.id,
        userEmail: invitee.email,
      }),
    ).resolves.toEqual({ organizationId: organization.id });

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, invitee.id));
    expect(membership.role).toBe("admin");
  });

  it("does not let admins grant admin access or members create invitations", async () => {
    const adminWorkspace = await seedWorkspace("admin");
    await expect(
      createOrganizationInvite(db, {
        organizationId: adminWorkspace.organization.id,
        userId: adminWorkspace.user.id,
        email: "new-admin@example.com",
        role: "admin",
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleError);

    const memberWorkspace = await seedWorkspace("member");
    await expect(
      createOrganizationInvite(db, {
        organizationId: memberWorkspace.organization.id,
        userId: memberWorkspace.user.id,
        email: "new-member@example.com",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleError);
  });

  it("prevents invitations for existing members and reissues the previous pending invite", async () => {
    const { organization, user } = await seedWorkspace();
    await expect(
      createOrganizationInvite(db, {
        organizationId: organization.id,
        userId: user.id,
        email: user.email,
        role: "member",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const first = await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: "new-member@example.com",
      role: "member",
    });
    const second = await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: "NEW-MEMBER@example.com",
      role: "member",
    });

    expect(await getOrganizationInviteByToken(db, first.token)).toBeNull();
    expect(await getOrganizationInviteByToken(db, second.token)).not.toBeNull();
    expect(
      await listPendingOrganizationInvites(db, {
        organizationId: organization.id,
        userId: user.id,
      }),
    ).toHaveLength(1);
  });

  it("revokes an invitation within its workspace and refuses to reuse it", async () => {
    const { organization, user } = await seedWorkspace();
    const invite = await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: "to-revoke@example.com",
      role: "member",
    });

    await revokeOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      inviteId: invite.inviteId,
    });
    await expect(
      registerAndAcceptOrganizationInvite(db, {
        token: invite.token,
        name: "Invitee",
        password: "securepass1",
      }),
    ).rejects.toBeInstanceOf(InvalidInvitationError);
    await expect(
      revokeOrganizationInvite(db, {
        organizationId: crypto.randomUUID(),
        userId: user.id,
        inviteId: invite.inviteId,
      }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  it("refuses to use an invite to create a duplicate account", async () => {
    const { organization, user } = await seedWorkspace();
    const invite = await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: "existing@example.com",
      role: "member",
    });
    await db.insert(users).values({
      email: "existing@example.com",
      name: "Already Registered",
      passwordHash: "test-hash",
    });

    await expect(
      registerAndAcceptOrganizationInvite(db, {
        token: invite.token,
        name: "Duplicate",
        password: "securepass1",
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});
