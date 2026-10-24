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
  claimNextCampaignContact,
  createCampaign,
  finishCampaignContact,
  getCampaignDetails,
  listCampaigns,
  listDueCampaigns,
  pauseCampaign,
  reapStaleDispatches,
  recordDispatchFailure,
  retryDelaySeconds,
  scheduleCampaign,
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
  it("rejects OpenAI Realtime agents because outbound campaigns still use Vapi", async () => {
    const { organization, user, agent, phoneNumber } = await seedWorkspace();
    await db
      .update(agents)
      .set({ voiceProvider: "openai_realtime" })
      .where(eq(agents.id, agent.id));

    await expect(
      createCampaign(db, {
        organizationId: organization.id,
        userId: user.id,
        input: {
          name: "Realtime campaign",
          agentId: agent.id,
          phoneNumberId: phoneNumber.id,
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

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

    const outcome = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
    });
    expect(outcome.kind).toBe("dispatched");

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

    const t0 = new Date("2026-01-01T12:00:00.000Z");
    const first = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
      now: t0,
    });
    expect(first.kind).toBe("dispatched");
    if (first.kind !== "dispatched") throw new Error("Expected a dispatch.");
    expect(first.dispatch.contact.phoneNumber).toBe("+14155550101");
    expect(first.dispatch.contact.attempts).toBe(1);

    // A second claim while the first call is in flight is a normal state.
    await expect(
      claimNextCampaignContact(db, {
        organizationId: organization.id,
        userId: user.id,
        campaignId: campaign.id,
        now: new Date(t0.getTime() + 120_000),
      }),
    ).resolves.toEqual({ kind: "busy" });

    const call = await startCampaignCall(db, {
      organizationId: organization.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      campaignContactId: first.dispatch.contact.id,
      fromNumber: phoneNumber.e164Number,
      toNumber: first.dispatch.contact.phoneNumber,
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
      .where(eq(campaignContacts.id, first.dispatch.contact.id));
    expect(finishedContact.status).toBe("completed");
    const [updatedCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(updatedCampaign.activeContactId).toBeNull();

    const nextDispatch = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
      now: new Date(t0.getTime() + 180_000),
    });
    expect(nextDispatch.kind).toBe("dispatched");
    if (nextDispatch.kind !== "dispatched") {
      throw new Error("Expected a second dispatch.");
    }
    expect(nextDispatch.dispatch.contact.phoneNumber).toBe("+14155550102");
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

async function seedCampaignWithContacts(phoneNumbers: string[]) {
  const workspace = await seedWorkspace();
  const campaign = await createCampaign(db, {
    organizationId: workspace.organization.id,
    userId: workspace.user.id,
    input: {
      name: "Scheduled follow-up",
      agentId: workspace.agent.id,
      phoneNumberId: workspace.phoneNumber.id,
    },
  });
  await addCampaignContacts(db, {
    organizationId: workspace.organization.id,
    userId: workspace.user.id,
    input: addCampaignContactsSchema.parse({
      campaignId: campaign.id,
      phoneNumbers: phoneNumbers.join("\n"),
      consentConfirmed: "on",
    }),
  });
  return { ...workspace, campaign };
}

describe("campaign scheduling and retries", () => {
  it("does not dispatch before the scheduled start time", async () => {
    const { organization, user, campaign } = await seedCampaignWithContacts([
      "+14155550101",
    ]);
    const start = new Date("2026-01-02T09:00:00.000Z");

    await scheduleCampaign(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
      scheduledAt: start,
      dispatchIntervalSeconds: 60,
      maxAttempts: 3,
      now: new Date("2026-01-01T09:00:00.000Z"),
    });

    const [scheduled] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.scheduledAt).toEqual(start);

    await expect(
      claimNextCampaignContact(db, {
        organizationId: organization.id,
        campaignId: campaign.id,
        now: new Date("2026-01-02T08:59:00.000Z"),
      }),
    ).resolves.toEqual({ kind: "scheduled", startsAt: start });

    await expect(
      claimNextCampaignContact(db, {
        organizationId: organization.id,
        campaignId: campaign.id,
        now: start,
      }),
    ).resolves.toMatchObject({ kind: "dispatched" });
  });

  it("paces dispatches by the configured interval", async () => {
    const { organization, user, campaign } = await seedCampaignWithContacts([
      "+14155550101",
      "+14155550102",
    ]);
    await scheduleCampaign(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
      scheduledAt: null,
      dispatchIntervalSeconds: 120,
      maxAttempts: 3,
    });

    const t0 = new Date("2026-01-01T12:00:00.000Z");
    const first = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      campaignId: campaign.id,
      now: t0,
    });
    expect(first.kind).toBe("dispatched");
    if (first.kind !== "dispatched") throw new Error("Expected a dispatch.");
    await finishCampaignContact(db, {
      contactId: first.dispatch.contact.id,
      status: "completed",
    });

    await expect(
      claimNextCampaignContact(db, {
        organizationId: organization.id,
        campaignId: campaign.id,
        now: new Date(t0.getTime() + 60_000),
      }),
    ).resolves.toEqual({
      kind: "throttled",
      nextEligibleAt: new Date(t0.getTime() + 120_000),
    });

    await expect(
      claimNextCampaignContact(db, {
        organizationId: organization.id,
        campaignId: campaign.id,
        now: new Date(t0.getTime() + 121_000),
      }),
    ).resolves.toMatchObject({ kind: "dispatched" });
  });

  it("retries a failed dispatch with backoff and parks it after the attempt limit", async () => {
    const { organization, user, campaign } = await seedCampaignWithContacts([
      "+14155550101",
    ]);
    await scheduleCampaign(db, {
      organizationId: organization.id,
      userId: user.id,
      campaignId: campaign.id,
      scheduledAt: null,
      dispatchIntervalSeconds: 10,
      maxAttempts: 2,
    });

    const t0 = new Date("2026-01-01T12:00:00.000Z");
    const first = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      campaignId: campaign.id,
      now: t0,
    });
    if (first.kind !== "dispatched") throw new Error("Expected a dispatch.");
    expect(first.dispatch.contact.attempts).toBe(1);

    const firstFailure = await recordDispatchFailure(db, {
      contactId: first.dispatch.contact.id,
      error: "vapi returned 502",
      now: t0,
    });
    expect(firstFailure).toMatchObject({ retried: true, attempts: 1, maxAttempts: 2 });
    expect(firstFailure?.nextAttemptAt?.getTime()).toBe(
      t0.getTime() + retryDelaySeconds(1) * 1000,
    );

    // The pacing interval has elapsed, but the retry backoff has not.
    await expect(
      claimNextCampaignContact(db, {
        organizationId: organization.id,
        campaignId: campaign.id,
        now: new Date(t0.getTime() + 60_000),
      }),
    ).resolves.toMatchObject({ kind: "throttled" });

    const retry = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      campaignId: campaign.id,
      now: firstFailure!.nextAttemptAt!,
    });
    expect(retry.kind).toBe("dispatched");
    if (retry.kind !== "dispatched") throw new Error("Expected a retry.");
    expect(retry.dispatch.contact.attempts).toBe(2);

    const secondFailure = await recordDispatchFailure(db, {
      contactId: retry.dispatch.contact.id,
      error: "vapi returned 502 again",
      now: firstFailure!.nextAttemptAt!,
    });
    expect(secondFailure).toMatchObject({ retried: false });

    const [contact] = await db
      .select()
      .from(campaignContacts)
      .where(eq(campaignContacts.id, retry.dispatch.contact.id));
    expect(contact.status).toBe("failed");
    expect(contact.attempts).toBe(2);
    expect(contact.lastError).toBe("vapi returned 502 again");

    const [released] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(released.activeContactId).toBeNull();
  });

  it("releases a dispatch that was claimed but never confirmed", async () => {
    const { organization, campaign } = await seedCampaignWithContacts([
      "+14155550101",
    ]);
    const t0 = new Date("2026-01-01T12:00:00.000Z");
    const claim = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      campaignId: campaign.id,
      now: t0,
    });
    if (claim.kind !== "dispatched") throw new Error("Expected a dispatch.");

    const { reaped } = await reapStaleDispatches(db, {
      now: new Date(t0.getTime() + 20 * 60_000),
    });
    expect(reaped).toBe(1);

    const [contact] = await db
      .select()
      .from(campaignContacts)
      .where(eq(campaignContacts.id, claim.dispatch.contact.id));
    expect(contact.status).toBe("pending");
    expect(contact.lastError).toBe(
      "Dispatch timed out before the call was confirmed.",
    );

    const [released] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(released.activeContactId).toBeNull();
  });

  it("does not reap a dispatch whose call is still ringing", async () => {
    const { organization, campaign, agent, phoneNumber } =
      await seedCampaignWithContacts(["+14155550101"]);
    const t0 = new Date("2026-01-01T12:00:00.000Z");
    const claim = await claimNextCampaignContact(db, {
      organizationId: organization.id,
      campaignId: campaign.id,
      now: t0,
    });
    if (claim.kind !== "dispatched") throw new Error("Expected a dispatch.");

    await startCampaignCall(db, {
      organizationId: organization.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      campaignContactId: claim.dispatch.contact.id,
      fromNumber: phoneNumber.e164Number,
      toNumber: claim.dispatch.contact.phoneNumber,
    });

    const { reaped } = await reapStaleDispatches(db, {
      now: new Date(t0.getTime() + 20 * 60_000),
    });
    expect(reaped).toBe(0);

    const [contact] = await db
      .select()
      .from(campaignContacts)
      .where(eq(campaignContacts.id, claim.dispatch.contact.id));
    expect(contact.status).toBe("calling");
  });

  it("lists only campaigns that the scheduler may act on", async () => {
    const workspace = await seedWorkspace();
    const makeCampaign = async (name: string) =>
      createCampaign(db, {
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
        input: {
          name,
          agentId: workspace.agent.id,
          phoneNumberId: workspace.phoneNumber.id,
        },
      });

    const future = await makeCampaign("Future");
    const ready = await makeCampaign("Ready");
    const paused = await makeCampaign("Paused");

    await scheduleCampaign(db, {
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
      campaignId: future.id,
      scheduledAt: new Date("2026-02-01T09:00:00.000Z"),
      dispatchIntervalSeconds: 60,
      maxAttempts: 3,
    });
    await scheduleCampaign(db, {
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
      campaignId: ready.id,
      scheduledAt: new Date("2026-01-01T09:00:00.000Z"),
      dispatchIntervalSeconds: 60,
      maxAttempts: 3,
    });
    await scheduleCampaign(db, {
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
      campaignId: paused.id,
      scheduledAt: new Date("2026-01-01T09:00:00.000Z"),
      dispatchIntervalSeconds: 60,
      maxAttempts: 3,
    });
    await pauseCampaign(db, {
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
      campaignId: paused.id,
    });

    const due = await listDueCampaigns(db, {
      now: new Date("2026-01-15T09:00:00.000Z"),
    });
    expect(due.map((campaign) => campaign.id)).toEqual([ready.id]);
  });
});
