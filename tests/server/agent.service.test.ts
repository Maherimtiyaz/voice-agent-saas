import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { organizationMembers, organizations, users } from "@/db/schema";
import { createAgent, getAgent, listAgents } from "@/server/services/agent.service";
import { NotAMemberError, NotFoundError } from "@/server/errors";

let db: TestDatabase;

async function seedOrgWithMember() {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme Inc", slug: `acme-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `${crypto.randomUUID()}@example.com`, name: "Ada", passwordHash: "x" })
    .returning();
  await db
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: user.id, role: "member" });
  return { org, user };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("agent service", () => {
  it("creates an agent scoped to the organization", async () => {
    const { org, user } = await seedOrgWithMember();

    const agent = await createAgent(db, {
      organizationId: org.id,
      userId: user.id,
      input: { name: "Front Desk Assistant" },
    });

    expect(agent.name).toBe("Front Desk Assistant");
    expect(agent.organizationId).toBe(org.id);
    expect(agent.status).toBe("draft");
  });

  it("retrieves an agent that belongs to the organization", async () => {
    const { org, user } = await seedOrgWithMember();
    const created = await createAgent(db, {
      organizationId: org.id,
      userId: user.id,
      input: { name: "Support Bot" },
    });

    const fetched = await getAgent(db, {
      organizationId: org.id,
      userId: user.id,
      agentId: created.id,
    });
    expect(fetched.id).toBe(created.id);
  });

  it("lists only agents belonging to the caller's organization", async () => {
    const { org: orgA, user: userA } = await seedOrgWithMember();
    const { org: orgB, user: userB } = await seedOrgWithMember();

    await createAgent(db, { organizationId: orgA.id, userId: userA.id, input: { name: "A1" } });
    await createAgent(db, { organizationId: orgB.id, userId: userB.id, input: { name: "B1" } });
    await createAgent(db, { organizationId: orgB.id, userId: userB.id, input: { name: "B2" } });

    const agentsForA = await listAgents(db, { organizationId: orgA.id, userId: userA.id });
    const agentsForB = await listAgents(db, { organizationId: orgB.id, userId: userB.id });

    expect(agentsForA.map((a) => a.name)).toEqual(["A1"]);
    expect(agentsForB.map((a) => a.name).sort()).toEqual(["B1", "B2"]);
  });

  it("refuses to fetch another organization's agent, even with a valid agent id", async () => {
    const { org: orgA, user: userA } = await seedOrgWithMember();
    const { org: orgB, user: userB } = await seedOrgWithMember();

    const agentInB = await createAgent(db, {
      organizationId: orgB.id,
      userId: userB.id,
      input: { name: "B-only agent" },
    });

    // userA IS a real member of orgA, and passes a real agent id — but
    // that agent belongs to orgB, so this must still be refused.
    await expect(
      getAgent(db, { organizationId: orgA.id, userId: userA.id, agentId: agentInB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses any agent operation for a non-member", async () => {
    const { org } = await seedOrgWithMember();
    const [outsider] = await db
      .insert(users)
      .values({ email: "outsider@example.com", name: "Outsider", passwordHash: "x" })
      .returning();

    await expect(
      listAgents(db, { organizationId: org.id, userId: outsider.id }),
    ).rejects.toBeInstanceOf(NotAMemberError);

    await expect(
      createAgent(db, {
        organizationId: org.id,
        userId: outsider.id,
        input: { name: "Should not be created" },
      }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });
});
