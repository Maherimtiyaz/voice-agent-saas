import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import {
  agents,
  campaignContacts,
  campaigns,
  organizationMembers,
  organizations,
  phoneNumbers,
  users,
} from "@/db/schema";
import {
  addCampaignContacts,
  createCampaign,
  getCampaignDetails,
  listCampaigns,
  reserveNextCampaignContact,
} from "@/server/services/campaign.service";
import { applyEndOfCallReport, setCampaignCallVapiId, startCampaignCall } from "@/server/services/call.service";
import { ConflictError, NotFoundError } from "@/server/errors";
import { addCampaignContactsSchema } from "@/server/validation/campaign";

let db: TestDatabase;
let phoneNumberSequence = 0;

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
      e164Number: `+141555501${(phoneNumberSequence++).toString().padStart(2, "0")}`,
      vapiPhoneNumberId: "vapi-phone-id",
    })
    .returning();

  return { organization, user, agent, phoneNumber };
}

beforeEach(async () => {
  db = await createTestDatabase();
  phoneNumberSequence = 0;
});

describe("campaign service", () => {
  it("creates tenant-scoped campaigns and lists contact counts", async () => {
    const { organization, user, agent, phoneNumber } = await seedWorkspace();
    const campaign = await createCampaign(db, {
      organizationId: organization.id,
      userId: user.id,
      input: { name: "Spring follow-up", agentId: agent.id, phoneNumberId: phoneNumber.id },
    });
    const input = addCampaignContactsSchema.parse({
      campaignId: campaign.id,
      phoneNumbers: "+14155550101\n+14155550102",
      consentConfirmed: "on",
    });

    await addCampaignContacts(db, {
      organizationId: organization.id,
      userId: user.id,
      input,
    });

    const [listed] = await listCampaigns(db, {
      organizationId: organization.id,
      userId: user.id,
    });
    const details = await getCampaignDetails(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
    });

    expect(listed.contactCount).toBe(2);
    expect(details.contacts.map((contact) => contact.phoneNumber)).toEqual([
      "+14155550101",
      "+14155550102",
    ]);
    expect(details.contacts.every((contact) => contact.consentConfirmedAt instanceof Date)).toBe(true);
    expect(details.contacts.every((contact) => contact.consentConfirmedByUserId === user.id)).toBe(true);
  });

  it("skips duplicates and refuses additions once a campaign is active", async () => {
    const { organization, user, agent, phoneNumber } = await seedWorkspace();
    const campaign = await createCampaign(db, {
      organizationId: organization.id,
      userId: user.id,
      input: { name: "Follow-up", agentId: agent.id, phoneNumberId: phoneNumber.id },
    });
    const input = addCampaignContactsSchema.parse({
      campaignId: campaign.id,
      phoneNumbers: "+14155550101\n+14155550101\n+14155550102",
      consentConfirmed: "on",
    });

    await expect(
      addCampaignContacts(db, { organizationId: organization.id, userId: user.id, input }),
    ).resolves.toEqual({ added: 2, skipped: 1 });

    await reserveNextCampaignContact(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
    });

    await expect(
      addCampaignContacts(db, { organizationId: organization.id, userId: user.id, input }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("dispatches a single call at a time and completes from the Vapi report", async () => {
    const { organization, user, agent, phoneNumber } = await seedWorkspace();
    const campaign = await createCampaign(db, {
      organizationId: organization.id,
      userId: user.id,
      input: { name: "Reminder", agentId: agent.id, phoneNumberId: phoneNumber.id },
    });
    const input = addCampaignContactsSchema.parse({
      campaignId: campaign.id,
      phoneNumbers: "+14155550101\n+14155550102",
      consentConfirmed: "on",
    });
    await addCampaignContacts(db, {
      organizationId: organization.id,
      userId: user.id,
      input,
    });

    const dispatch = await reserveNextCampaignContact(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
    });
    expect(dispatch?.contact.phoneNumber).toBe("+14155550101");
    await expect(
      reserveNextCampaignContact(db, {
        organizationId: organization.id,
        userId: user.id,
        campaignId: campaign.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    if (!dispatch) throw new Error("Expected a dispatch reservation.");
    const call = await startCampaignCall(db, {
      organizationId: organization.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      campaignContactId: dispatch.contact.id,
      fromNumber: phoneNumber.e164Number,
      toNumber: dispatch.contact.phoneNumber,
    });
    expect(call.twilioCallSid).toBeNull();

    await setCampaignCallVapiId(db, { callId: call.id, vapiCallId: "outbound-call-id" });
    await applyEndOfCallReport(db, {
      vapiCallId: "outbound-call-id",
      endedReason: "customer-ended-call",
      durationSeconds: 12,
    });

    const [finishedContact] = await db
      .select()
      .from(campaignContacts)
      .where(eq(campaignContacts.id, dispatch.contact.id));
    expect(finishedContact.status).toBe("completed");
    const [updatedCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(updatedCampaign.activeContactId).toBeNull();

    const nextDispatch = await reserveNextCampaignContact(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
    });
    expect(nextDispatch?.contact.phoneNumber).toBe("+14155550102");
  });

  it("does not allow campaign setup from a different workspace", async () => {
    const workspaceA = await seedWorkspace();
    const workspaceB = await seedWorkspace();
    await expect(
      createCampaign(db, {
        organizationId: workspaceA.organization.id,
        userId: workspaceA.user.id,
        input: {
          name: "Cross-tenant",
          agentId: workspaceB.agent.id,
          phoneNumberId: workspaceB.phoneNumber.id,
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("validates consent and E.164 numbers before persistence", () => {
    expect(
      addCampaignContactsSchema.safeParse({
        campaignId: crypto.randomUUID(),
        phoneNumbers: "+14155550101",
        consentConfirmed: "",
      }).success,
    ).toBe(false);
    expect(
      addCampaignContactsSchema.safeParse({
        campaignId: crypto.randomUUID(),
        phoneNumbers: "555-1234",
        consentConfirmed: "on",
      }).success,
    ).toBe(false);
  });
});
