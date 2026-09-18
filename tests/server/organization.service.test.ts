import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { organizationMembers, organizations, users } from "@/db/schema";
import {
  findMembership,
  listUserOrganizations,
  requireMembership,
} from "@/server/services/organization.service";
import { InsufficientRoleError, NotAMemberError } from "@/server/errors";

let db: TestDatabase;

async function seedOrgWithMember(role: "owner" | "admin" | "member" = "member") {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme Inc", slug: `acme-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `${crypto.randomUUID()}@example.com`, name: "Ada", passwordHash: "x" })
    .returning();
  await db.insert(organizationMembers).values({
    organizationId: org.id,
    userId: user.id,
    role,
  });
  return { org, user };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("organization membership", () => {
  it("lets a member access their own organization", async () => {
    const { org, user } = await seedOrgWithMember("member");
    const role = await findMembership(db, { organizationId: org.id, userId: user.id });
    expect(role).toBe("member");
  });

  it("rejects a user who is not a member of the organization", async () => {
    const { org } = await seedOrgWithMember();
    const [outsider] = await db
      .insert(users)
      .values({ email: "outsider@example.com", name: "Outsider", passwordHash: "x" })
      .returning();

    await expect(
      requireMembership(db, { organizationId: org.id, userId: outsider.id }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  it("rejects a member whose role isn't in the allowed list", async () => {
    const { org, user } = await seedOrgWithMember("member");

    await expect(
      requireMembership(db, {
        organizationId: org.id,
        userId: user.id,
        allowedRoles: ["owner", "admin"],
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleError);
  });

  it("allows a member whose role is in the allowed list", async () => {
    const { org, user } = await seedOrgWithMember("owner");

    await expect(
      requireMembership(db, {
        organizationId: org.id,
        userId: user.id,
        allowedRoles: ["owner", "admin"],
      }),
    ).resolves.toBe("owner");
  });

  it("lists every organization a user belongs to", async () => {
    const { user } = await seedOrgWithMember("owner");
    const [secondOrg] = await db
      .insert(organizations)
      .values({ name: "Second Org", slug: `second-${crypto.randomUUID()}` })
      .returning();
    await db
      .insert(organizationMembers)
      .values({ organizationId: secondOrg.id, userId: user.id, role: "admin" });

    const memberships = await listUserOrganizations(db, user.id);
    expect(memberships).toHaveLength(2);
    expect(memberships.map((m) => m.role).sort()).toEqual(["admin", "owner"]);
  });

  it("prevents duplicate membership rows for the same user/org pair", async () => {
    const { org, user } = await seedOrgWithMember("member");

    await expect(
      db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "admin",
      }),
    ).rejects.toThrow();
  });
});
