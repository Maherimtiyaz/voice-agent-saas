import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import {
  agents,
  campaignContacts,
  calls,
  campaigns,
  organizationMembers,
  organizations,
  phoneNumbers,
  users,
} from "@/db/schema";
import {
  addCampaignContacts,
  createCampaign,
  scheduleCampaign,
} from "@/server/services/campaign.service";
import { runCampaignTick } from "@/server/services/campaign-dispatch.service";
import { addCampaignContactsSchema } from "@/server/validation/campaign";

let db: TestDatabase;

async function seedActiveCampaign() {
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
  const [agent] = await db
    .insert(agents)
    .values({
      organizationId: organization.id,
      name: "Campaign agent",
      vapiAssistantId: "assistant-id",
    })
    .returning();
  const [phoneNumber] = await db
    .insert(phoneNumbers)
    .values({
      organizationId: organization.id,
      agentId: agent.id,
      twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
      e164Number: `+14155550${Math.floor(Math.random() * 900 + 100)}`,
      vapiPhoneNumberId: "vapi-phone-id",
    })
    .returning();

  const campaign = await createCampaign(db, {
    organizationId: organization.id,
    userId: user.id,
    input: {
      name: "Scheduled reminders",
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
    },
  });
  await addCampaignContacts(db, {
    organizationId: organization.id,
    userId: user.id,
    input: addCampaignContactsSchema.parse({
      campaignId: campaign.id,
      phoneNumbers: "+14155550101\n+14155550102",
      consentConfirmed: "on",
    }),
  });

  const now = new Date("2026-01-01T12:00:00.000Z");
  await scheduleCampaign(db, {
    organizationId: organization.id,
    userId: user.id,
    campaignId: campaign.id,
    scheduledAt: new Date("2026-01-01T11:00:00.000Z"),
    dispatchIntervalSeconds: 60,
    maxAttempts: 3,
    now,
  });

  return { organization, user, agent, phoneNumber, campaign, now };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("campaign scheduler tick", () => {
  it("dispatches the next contact and records the provider call id", async () => {
    const { campaign, now } = await seedActiveCampaign();

    const result = await runCampaignTick(db, {
      now,
      placeCall: async () => ({ vapiCallId: "vapi-call-1" }),
    });

    expect(result.checked).toBe(1);
    expect(result.dispatched).toBe(1);
    expect(result.failed).toBe(0);

    const contacts = await db
      .select()
      .from(campaignContacts)
      .where(eq(campaignContacts.campaignId, campaign.id));
    const contact = contacts.find((row) => row.status === "calling");
    if (!contact) throw new Error("Expected a claimed contact.");
    expect(contact.attempts).toBe(1);

    const [call] = await db.select().from(calls);
    expect(call.vapiCallId).toBe("vapi-call-1");
    expect(call.campaignContactId).toBe(contact.id);

    const [row] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(row.activeContactId).toBe(contact.id);
  });

  it("re-queues the contact when the provider refuses the call", async () => {
    const { campaign, now } = await seedActiveCampaign();

    const result = await runCampaignTick(db, {
      now,
      placeCall: async () => {
        throw new Error("vapi unavailable");
      },
    });

    expect(result.failed).toBe(1);
    expect(result.dispatched).toBe(0);

    const contacts = await db
      .select()
      .from(campaignContacts)
      .where(eq(campaignContacts.campaignId, campaign.id));
    const contact = contacts.find((row) => row.attempts > 0);
    if (!contact) throw new Error("Expected an attempted contact.");
    // Attempt 1 of 3 failed, so the contact is waiting for its backoff.
    expect(contact.status).toBe("pending");
    expect(contact.attempts).toBe(1);
    expect(contact.lastError).toBe("vapi_outbound_call_creation_failed");

    const [call] = await db.select().from(calls);
    expect(call.status).toBe("failed");

    const [row] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(row.activeContactId).toBeNull();
    expect(row.status).toBe("active");
  });

  it("skips a campaign while a call is in flight", async () => {
    const { now } = await seedActiveCampaign();

    await runCampaignTick(db, {
      now,
      placeCall: async () => ({ vapiCallId: "vapi-call-2" }),
    });

    const second = await runCampaignTick(db, {
      now: new Date(now.getTime() + 10 * 60_000),
      placeCall: async () => {
        throw new Error("should not be called");
      },
    });

    expect(second.checked).toBe(0);
    expect(second.dispatched).toBe(0);
  });
});
