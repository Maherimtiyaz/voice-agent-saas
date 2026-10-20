import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import {
  agents,
  campaignContacts,
  campaigns,
  phoneNumbers,
} from "@/db/schema";
import type {
  Agent,
  Campaign,
  CampaignContact,
  CampaignContactStatus,
  PhoneNumber,
} from "@/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { requireMembership } from "@/server/services/organization.service";
import type {
  AddCampaignContactsInput,
  CreateCampaignInput,
} from "@/server/validation/campaign";

export interface CampaignListItem extends Campaign {
  contactCount: number;
}

export interface CampaignDetails {
  campaign: Campaign;
  agentName: string;
  phoneNumberE164: string;
  contacts: CampaignContact[];
}

export interface CampaignDispatch {
  campaign: Campaign;
  contact: CampaignContact;
  agent: Agent & { vapiAssistantId: string };
  phoneNumber: PhoneNumber & { vapiPhoneNumberId: string };
}

export async function listCampaigns(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<CampaignListItem[]> {
  await requireMembership(db, params);

  const [campaignRows, contactCounts] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, params.organizationId))
      .orderBy(asc(campaigns.createdAt)),
    db
      .select({ campaignId: campaignContacts.campaignId, total: count() })
      .from(campaignContacts)
      .innerJoin(campaigns, eq(campaignContacts.campaignId, campaigns.id))
      .where(eq(campaigns.organizationId, params.organizationId))
      .groupBy(campaignContacts.campaignId),
  ]);

  const countsByCampaign = new Map(
    contactCounts.map((row) => [row.campaignId, row.total]),
  );

  return campaignRows.map((campaign) => ({
    ...campaign,
    contactCount: countsByCampaign.get(campaign.id) ?? 0,
  }));
}

export async function getCampaignDetails(
  db: Database,
  params: { organizationId: string; userId: string; campaignId: string },
): Promise<CampaignDetails> {
  await requireMembership(db, params);

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.organizationId, params.organizationId),
      ),
    )
    .limit(1);

  if (!campaign) throw new NotFoundError("Campaign");

  const [[agent], [phoneNumber], contacts] = await Promise.all([
    db.select({ name: agents.name }).from(agents).where(eq(agents.id, campaign.agentId)).limit(1),
    db
      .select({ e164Number: phoneNumbers.e164Number })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.id, campaign.phoneNumberId))
      .limit(1),
    db
      .select()
      .from(campaignContacts)
      .where(eq(campaignContacts.campaignId, campaign.id))
      .orderBy(asc(campaignContacts.createdAt)),
  ]);

  if (!agent || !phoneNumber) throw new NotFoundError("Campaign configuration");

  return {
    campaign,
    agentName: agent.name,
    phoneNumberE164: phoneNumber.e164Number,
    contacts,
  };
}

export async function createCampaign(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    input: CreateCampaignInput;
  },
): Promise<Campaign> {
  await requireMembership(db, params);

  const [[agent], [phoneNumber]] = await Promise.all([
    db
      .select({ id: agents.id, voiceProvider: agents.voiceProvider })
      .from(agents)
      .where(
        and(
          eq(agents.id, params.input.agentId),
          eq(agents.organizationId, params.organizationId),
        ),
      )
      .limit(1),
    db
      .select({ id: phoneNumbers.id })
      .from(phoneNumbers)
      .where(
        and(
          eq(phoneNumbers.id, params.input.phoneNumberId),
          eq(phoneNumbers.organizationId, params.organizationId),
        ),
      )
      .limit(1),
  ]);

  if (!agent) throw new NotFoundError("Agent");
  if (agent.voiceProvider !== "vapi") {
    throw new ConflictError("Outbound campaigns currently require a Vapi voice agent.");
  }
  if (!phoneNumber) throw new NotFoundError("Phone number");

  const [campaign] = await db
    .insert(campaigns)
    .values({
      organizationId: params.organizationId,
      name: params.input.name,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
    })
    .returning();

  return campaign;
}

export async function addCampaignContacts(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    input: AddCampaignContactsInput;
  },
): Promise<{ added: number; skipped: number }> {
  await requireMembership(db, params);

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, params.input.campaignId),
        eq(campaigns.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!campaign) throw new NotFoundError("Campaign");
  if (
    !["draft", "paused"].includes(campaign.status) ||
    campaign.activeContactId !== null
  ) {
    throw new ConflictError("Pause the campaign and wait for its current call before adding contacts.");
  }

  const uniqueNumbers = [...new Set(params.input.phoneNumbers)];
  const inserted = await db
    .insert(campaignContacts)
    .values(
      uniqueNumbers.map((phoneNumber) => ({
        campaignId: campaign.id,
        phoneNumber,
        consentConfirmedAt: new Date(),
        consentConfirmedByUserId: params.userId,
      })),
    )
    .onConflictDoNothing({
      target: [campaignContacts.campaignId, campaignContacts.phoneNumber],
    })
    .returning({ id: campaignContacts.id });

  return { added: inserted.length, skipped: params.input.phoneNumbers.length - inserted.length };
}

export async function reserveNextCampaignContact(
  db: Database,
  params: { organizationId: string; userId: string; campaignId: string },
): Promise<CampaignDispatch | null> {
  await requireMembership(db, params);

  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, params.campaignId),
          eq(campaigns.organizationId, params.organizationId),
        ),
      )
      .limit(1);
    if (!campaign) throw new NotFoundError("Campaign");
    if (campaign.status === "completed") {
      throw new ConflictError("This campaign is already complete.");
    }
    if (campaign.activeContactId !== null) {
      throw new ConflictError("A campaign call is already in progress.");
    }

    const [[agent], [phoneNumber]] = await Promise.all([
      tx
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, campaign.agentId),
            eq(agents.organizationId, params.organizationId),
          ),
        )
        .limit(1),
      tx
        .select()
        .from(phoneNumbers)
        .where(
          and(
            eq(phoneNumbers.id, campaign.phoneNumberId),
            eq(phoneNumbers.organizationId, params.organizationId),
          ),
        )
        .limit(1),
    ]);
    const assistantId = agent?.vapiAssistantId;
    if (!agent || agent.voiceProvider !== "vapi" || !assistantId) {
      throw new ConflictError("Sync the campaign's agent to Vapi before starting.");
    }
    const vapiPhoneNumberId = phoneNumber?.vapiPhoneNumberId;
    if (
      !phoneNumber ||
      phoneNumber.status !== "active" ||
      !vapiPhoneNumberId
    ) {
      throw new ConflictError("Choose an active phone number imported into Vapi before starting.");
    }

    const [contact] = await tx
      .select()
      .from(campaignContacts)
      .where(
        and(
          eq(campaignContacts.campaignId, campaign.id),
          eq(campaignContacts.status, "pending"),
        ),
      )
      .orderBy(asc(campaignContacts.createdAt))
      .limit(1);

    if (!contact) {
      await tx
        .update(campaigns)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(campaigns.id, campaign.id));
      return null;
    }

    const [claimedCampaign] = await tx
      .update(campaigns)
      .set({
        status: "active",
        activeContactId: contact.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaigns.id, campaign.id),
          inArray(campaigns.status, ["draft", "active", "paused"]),
          isNull(campaigns.activeContactId),
        ),
      )
      .returning();
    if (!claimedCampaign) {
      throw new ConflictError("A campaign call is already in progress.");
    }

    const [claimedContact] = await tx
      .update(campaignContacts)
      .set({ status: "calling" })
      .where(
        and(
          eq(campaignContacts.id, contact.id),
          eq(campaignContacts.status, "pending"),
        ),
      )
      .returning();
    if (!claimedContact) {
      throw new ConflictError("This contact is no longer available to call.");
    }

    return {
      campaign: claimedCampaign,
      contact: claimedContact,
      agent: { ...agent, vapiAssistantId: assistantId },
      phoneNumber: { ...phoneNumber, vapiPhoneNumberId },
    };
  });
}

export async function pauseCampaign(
  db: Database,
  params: { organizationId: string; userId: string; campaignId: string },
): Promise<void> {
  await requireMembership(db, params);

  const [updated] = await db
    .update(campaigns)
    .set({ status: "paused", updatedAt: new Date() })
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.organizationId, params.organizationId),
        eq(campaigns.status, "active"),
      ),
    )
    .returning({ id: campaigns.id });
  if (updated) return;

  const [campaign] = await db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!campaign) throw new NotFoundError("Campaign");
  if (campaign.status !== "paused") {
    throw new ConflictError("Only an active campaign can be paused.");
  }
}

export async function finishCampaignContact(
  db: Database,
  params: { contactId: string; status: Exclude<CampaignContactStatus, "pending" | "calling"> },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [finishedContact] = await tx
      .update(campaignContacts)
      .set({ status: params.status })
      .where(
        and(
          eq(campaignContacts.id, params.contactId),
          eq(campaignContacts.status, "calling"),
        ),
      )
      .returning({ id: campaignContacts.id, campaignId: campaignContacts.campaignId });

    if (!finishedContact) return;

    await tx
      .update(campaigns)
      .set({ activeContactId: null, updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, finishedContact.campaignId),
          eq(campaigns.activeContactId, finishedContact.id),
        ),
      );
  });
}
