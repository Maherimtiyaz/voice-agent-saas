import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import {
  agents,
  calls,
  organizationMembers,
  organizations,
  phoneNumbers,
  users,
} from "@/db/schema";
import { getOnboardingStatus } from "@/server/services/onboarding.service";
import { NotAMemberError } from "@/server/errors";

let db: TestDatabase;

async function seedWorkspace() {
  const [organization] = await db
    .insert(organizations)
    .values({ name: "Acme", slug: `acme-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@example.com`,
      name: "Ada",
      passwordHash: "x",
    })
    .returning();
  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId: user.id,
    role: "owner",
  });
  return { organization, user };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("onboarding status", () => {
  it("starts with every step incomplete for a brand new workspace", async () => {
    const { organization, user } = await seedWorkspace();

    const status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });

    expect(status.totalCount).toBe(5);
    expect(status.completedCount).toBe(0);
    expect(status.isComplete).toBe(false);
    expect(status.steps.every((step) => !step.complete)).toBe(true);
  });

  it("marks the agent step complete once an agent exists", async () => {
    const { organization, user } = await seedWorkspace();
    await db.insert(agents).values({
      organizationId: organization.id,
      name: "Receptionist",
    });

    const status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });

    const agentStep = status.steps.find((step) => step.id === "create_agent");
    const syncStep = status.steps.find((step) => step.id === "sync_agent");
    expect(agentStep?.complete).toBe(true);
    // Creating an agent is not the same as syncing it.
    expect(syncStep?.complete).toBe(false);
  });

  it("marks the sync step complete only once the agent has a Vapi assistant id", async () => {
    const { organization, user } = await seedWorkspace();
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: organization.id, name: "Receptionist" })
      .returning();

    await db
      .update(agents)
      .set({ vapiAssistantId: "assistant-123" })
      .where(eq(agents.id, agent.id));

    const status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });

    expect(
      status.steps.find((step) => step.id === "sync_agent")?.complete,
    ).toBe(true);
  });

  it("tracks the phone number and assignment steps separately", async () => {
    const { organization, user } = await seedWorkspace();
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: organization.id, name: "Receptionist" })
      .returning();

    await db.insert(phoneNumbers).values({
      organizationId: organization.id,
      twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
      e164Number: "+14155550100",
    });

    let status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });
    expect(
      status.steps.find((step) => step.id === "register_number")?.complete,
    ).toBe(true);
    expect(
      status.steps.find((step) => step.id === "assign_number")?.complete,
    ).toBe(false);

    await db
      .update(phoneNumbers)
      .set({ agentId: agent.id })
      .where(eq(phoneNumbers.organizationId, organization.id));

    status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });
    expect(
      status.steps.find((step) => step.id === "assign_number")?.complete,
    ).toBe(true);
  });

  it("marks the test call step complete once a call exists", async () => {
    const { organization, user } = await seedWorkspace();
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: organization.id, name: "Receptionist" })
      .returning();
    const [phoneNumber] = await db
      .insert(phoneNumbers)
      .values({
        organizationId: organization.id,
        agentId: agent.id,
        twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
        e164Number: "+14155550101",
      })
      .returning();

    await db.insert(calls).values({
      organizationId: organization.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      fromNumber: "+14155550101",
      toNumber: "+14155550199",
    });

    const status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });

    expect(
      status.steps.find((step) => step.id === "test_call")?.complete,
    ).toBe(true);
  });

  it("reports completion only when every step is done", async () => {
    const { organization, user } = await seedWorkspace();
    const [agent] = await db
      .insert(agents)
      .values({
        organizationId: organization.id,
        name: "Receptionist",
        vapiAssistantId: "assistant-123",
      })
      .returning();
    const [phoneNumber] = await db
      .insert(phoneNumbers)
      .values({
        organizationId: organization.id,
        agentId: agent.id,
        twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
        e164Number: "+14155550102",
      })
      .returning();
    await db.insert(calls).values({
      organizationId: organization.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      fromNumber: "+14155550102",
      toNumber: "+14155550198",
    });

    const status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });

    expect(status.completedCount).toBe(status.totalCount);
    expect(status.isComplete).toBe(true);
  });

  it("does not count another organization's progress", async () => {
    const { organization, user } = await seedWorkspace();
    const other = await seedWorkspace();

    // Give the OTHER workspace a fully set up agent.
    const [agent] = await db
      .insert(agents)
      .values({
        organizationId: other.organization.id,
        name: "Other agent",
        vapiAssistantId: "assistant-999",
      })
      .returning();
    await db.insert(phoneNumbers).values({
      organizationId: other.organization.id,
      agentId: agent.id,
      twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
      e164Number: "+14155550103",
    });

    const status = await getOnboardingStatus(db, {
      organizationId: organization.id,
      userId: user.id,
    });

    expect(status.completedCount).toBe(0);
  });

  it("refuses to report status for a user who is not a member", async () => {
    const { organization } = await seedWorkspace();
    const outsider = await seedWorkspace();

    await expect(
      getOnboardingStatus(db, {
        organizationId: organization.id,
        userId: outsider.user.id,
      }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });
});
