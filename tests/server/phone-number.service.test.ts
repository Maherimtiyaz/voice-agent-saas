import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agents, organizationMembers, organizations, users } from "@/db/schema";
import {
  assignAgentToPhoneNumber,
  createPhoneNumber,
  listPhoneNumbers,
  resolvePhoneNumberForInboundCall,
} from "@/server/services/phone-number.service";
import { ConflictError, NotAMemberError, NotFoundError } from "@/server/errors";

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

async function seedAgent(organizationId: string, name = "Front Desk") {
  const [agent] = await db.insert(agents).values({ organizationId, name }).returning();
  return agent;
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("phone number service", () => {
  it("registers a phone number scoped to the organization", async () => {
    const { org, user } = await seedOrgWithMember();

    const phoneNumber = await createPhoneNumber(db, {
      organizationId: org.id,
      userId: user.id,
      input: { twilioNumberSid: "PN1234567890", e164Number: "+14155551234" },
    });

    expect(phoneNumber.organizationId).toBe(org.id);
    expect(phoneNumber.status).toBe("active");
    expect(phoneNumber.agentId).toBeNull();
  });

  it("rejects a duplicate Twilio SID", async () => {
    const { org, user } = await seedOrgWithMember();
    await createPhoneNumber(db, {
      organizationId: org.id,
      userId: user.id,
      input: { twilioNumberSid: "PN1234567890", e164Number: "+14155551234" },
    });

    await expect(
      createPhoneNumber(db, {
        organizationId: org.id,
        userId: user.id,
        input: { twilioNumberSid: "PN1234567890", e164Number: "+14155559999" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a duplicate E.164 number even with a different SID", async () => {
    const { org, user } = await seedOrgWithMember();
    await createPhoneNumber(db, {
      organizationId: org.id,
      userId: user.id,
      input: { twilioNumberSid: "PN1111111111", e164Number: "+14155551234" },
    });

    await expect(
      createPhoneNumber(db, {
        organizationId: org.id,
        userId: user.id,
        input: { twilioNumberSid: "PN2222222222", e164Number: "+14155551234" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to assign a phone number to another organization's agent", async () => {
    const { org: orgA, user: userA } = await seedOrgWithMember();
    const { org: orgB } = await seedOrgWithMember();
    const agentInB = await seedAgent(orgB.id);

    const phoneNumber = await createPhoneNumber(db, {
      organizationId: orgA.id,
      userId: userA.id,
      input: { twilioNumberSid: "PN3333333333", e164Number: "+14155550000" },
    });

    await expect(
      assignAgentToPhoneNumber(db, {
        organizationId: orgA.id,
        userId: userA.id,
        phoneNumberId: phoneNumber.id,
        agentId: agentInB.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to operate on another organization's phone number", async () => {
    const { org: orgA, user: userA } = await seedOrgWithMember();
    const { org: orgB, user: userB } = await seedOrgWithMember();

    const phoneNumberInA = await createPhoneNumber(db, {
      organizationId: orgA.id,
      userId: userA.id,
      input: { twilioNumberSid: "PN4444444444", e164Number: "+14155550001" },
    });

    // userB is a real member of orgB, but the phone number belongs to
    // orgA — scoping the lookup by orgB must still refuse it.
    await expect(
      assignAgentToPhoneNumber(db, {
        organizationId: orgB.id,
        userId: userB.id,
        phoneNumberId: phoneNumberInA.id,
        agentId: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only phone numbers belonging to the caller's organization", async () => {
    const { org: orgA, user: userA } = await seedOrgWithMember();
    const { org: orgB, user: userB } = await seedOrgWithMember();

    await createPhoneNumber(db, {
      organizationId: orgA.id,
      userId: userA.id,
      input: { twilioNumberSid: "PN5555555555", e164Number: "+14155550002" },
    });
    await createPhoneNumber(db, {
      organizationId: orgB.id,
      userId: userB.id,
      input: { twilioNumberSid: "PN6666666666", e164Number: "+14155550003" },
    });

    const numbersForA = await listPhoneNumbers(db, { organizationId: orgA.id, userId: userA.id });
    expect(numbersForA.map((n) => n.e164Number)).toEqual(["+14155550002"]);
  });

  it("rejects a non-member from registering a phone number", async () => {
    const { org } = await seedOrgWithMember();
    const [outsider] = await db
      .insert(users)
      .values({ email: "outsider@example.com", name: "Outsider", passwordHash: "x" })
      .returning();

    await expect(
      createPhoneNumber(db, {
        organizationId: org.id,
        userId: outsider.id,
        input: { twilioNumberSid: "PN7777777777", e164Number: "+14155550004" },
      }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  describe("resolvePhoneNumberForInboundCall (the webhook trust boundary)", () => {
    it("resolves the agent for a registered, assigned number", async () => {
      const { org, user } = await seedOrgWithMember();
      const agent = await seedAgent(org.id);
      await createPhoneNumber(db, {
        organizationId: org.id,
        userId: user.id,
        input: { twilioNumberSid: "PN8888888888", e164Number: "+14155550005", agentId: agent.id },
      });

      const resolved = await resolvePhoneNumberForInboundCall(db, "+14155550005");
      expect(resolved?.agent?.id).toBe(agent.id);
    });

    it("returns null for a number that was never registered", async () => {
      const resolved = await resolvePhoneNumberForInboundCall(db, "+19995550000");
      expect(resolved).toBeNull();
    });

    it("returns the phone number with a null agent when none is assigned", async () => {
      const { org, user } = await seedOrgWithMember();
      await createPhoneNumber(db, {
        organizationId: org.id,
        userId: user.id,
        input: { twilioNumberSid: "PN9999999999", e164Number: "+14155550006" },
      });

      const resolved = await resolvePhoneNumberForInboundCall(db, "+14155550006");
      expect(resolved?.agent).toBeNull();
    });
  });
});
