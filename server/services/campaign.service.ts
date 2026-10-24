import { and, asc, count, eq, inArray, isNotNull, isNull, lte, min, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  agents,
  calls,
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

/**
 * The result of asking a campaign for its next call.
 *
 * Every non-`dispatched` answer is a normal, expected state rather than
 * an error: a campaign that is waiting for its start time or its pacing
 * interval is working correctly, and the caller should say so instead
 * of treating it as a failed dispatch.
 */
export type CampaignDispatchOutcome =
  | { kind: "dispatched"; dispatch: CampaignDispatch }
  | { kind: "throttled"; nextEligibleAt: Date }
  | { kind: "scheduled"; startsAt: Date }
  | { kind: "busy" }
  | { kind: "paused" }
  | { kind: "exhausted" };

/**
 * Backoff between retries of a failed DISPATCH (we could not place the
 * call at all), indexed by the attempt that just failed.
 *
 * Genuine call outcomes — a person not answering, or hanging up — are
 * not retried. Calling someone again because they did not pick up is a
 * product decision, not a reliability fix, and it is easy to get wrong
 * in a way that harasses people.
 */
const RETRY_DELAYS_SECONDS = [5 * 60, 15 * 60, 60 * 60];

export function retryDelaySeconds(attempts: number): number {
  const index = Math.min(
    Math.max(attempts - 1, 0),
    RETRY_DELAYS_SECONDS.length - 1,
  );
  return RETRY_DELAYS_SECONDS[index];
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

/**
 * Claims the next contact that is allowed to be called right now.
 *
 * The claim is what makes dispatch safe under concurrency: the campaign
 * row is updated with `is_null(active_contact_id)` as part of the WHERE
 * clause, so two schedulers racing for the same campaign cannot both
 * win. The contact is then moved from `pending` to `calling` with the
 * same compare-and-set shape.
 *
 * Attempts are counted HERE rather than after the provider call, so a
 * process that dies mid-dispatch still burns an attempt instead of
 * retrying forever.
 */
export async function claimNextCampaignContact(
  db: Database,
  params: {
    organizationId: string;
    campaignId: string;
    /** Omitted by the internal scheduler, which has no user session. */
    userId?: string;
    now?: Date;
  },
): Promise<CampaignDispatchOutcome> {
  if (params.userId) {
    await requireMembership(db, {
      organizationId: params.organizationId,
      userId: params.userId,
    });
  }

  const now = params.now ?? new Date();

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

    if (campaign.status === "completed") return { kind: "exhausted" } as const;
    if (campaign.status === "paused") return { kind: "paused" } as const;
    if (campaign.activeContactId !== null) return { kind: "busy" } as const;

    if (campaign.scheduledAt && campaign.scheduledAt.getTime() > now.getTime()) {
      return { kind: "scheduled", startsAt: campaign.scheduledAt } as const;
    }

    if (campaign.lastDispatchedAt) {
      const nextEligibleAt = new Date(
        campaign.lastDispatchedAt.getTime() +
          campaign.dispatchIntervalSeconds * 1000,
      );
      if (nextEligibleAt.getTime() > now.getTime()) {
        return { kind: "throttled", nextEligibleAt } as const;
      }
    }

    const [contact] = await tx
      .select()
      .from(campaignContacts)
      .where(
        and(
          eq(campaignContacts.campaignId, campaign.id),
          eq(campaignContacts.status, "pending"),
          // A contact with no retry scheduled is due immediately. Only a
          // contact that already failed carries a future `nextAttemptAt`.
          or(
            isNull(campaignContacts.nextAttemptAt),
            lte(campaignContacts.nextAttemptAt, now),
          ),
        ),
      )
      .orderBy(asc(campaignContacts.createdAt), asc(campaignContacts.nextAttemptAt))
      .limit(1);

    if (!contact) {
      const [waiting] = await tx
        .select({ nextAttemptAt: min(campaignContacts.nextAttemptAt) })
        .from(campaignContacts)
        .where(
          and(
            eq(campaignContacts.campaignId, campaign.id),
            eq(campaignContacts.status, "pending"),
          ),
        );

      if (waiting?.nextAttemptAt) {
        return { kind: "throttled", nextEligibleAt: waiting.nextAttemptAt } as const;
      }

      await tx
        .update(campaigns)
        .set({ status: "completed", activeContactId: null, updatedAt: now })
        .where(eq(campaigns.id, campaign.id));
      return { kind: "exhausted" } as const;
    }

    // Only validate the provider wiring once there is actually a call to
    // place — an empty campaign should complete, not report a config error.
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

    const [claimedCampaign] = await tx
      .update(campaigns)
      .set({
        status: "active",
        activeContactId: contact.id,
        lastDispatchedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(campaigns.id, campaign.id),
          isNull(campaigns.activeContactId),
          inArray(campaigns.status, ["draft", "scheduled", "active"]),
        ),
      )
      .returning();
    // Losing this race is a normal outcome, not an error.
    if (!claimedCampaign) return { kind: "busy" } as const;

    const [claimedContact] = await tx
      .update(campaignContacts)
      .set({
        status: "calling",
        attempts: contact.attempts + 1,
        lastError: null,
      })
      .where(
        and(
          eq(campaignContacts.id, contact.id),
          eq(campaignContacts.status, "pending"),
        ),
      )
      .returning();
    if (!claimedContact) {
      await tx
        .update(campaigns)
        .set({ activeContactId: null, updatedAt: now })
        .where(eq(campaigns.id, campaign.id));
      return { kind: "busy" } as const;
    }

    return {
      kind: "dispatched",
      dispatch: {
        campaign: claimedCampaign,
        contact: claimedContact,
        agent: { ...agent, vapiAssistantId: assistantId },
        phoneNumber: { ...phoneNumber, vapiPhoneNumberId },
      },
    } as const;
  });
}

/**
 * Records that a dispatch attempt failed before the call was confirmed,
 * and decides whether the contact is retried.
 *
 * Retried contacts go back to `pending` with a future `next_attempt_at`,
 * so the normal claim query picks them up again with no special case.
 * When attempts are exhausted the contact is parked as `failed` with the
 * error preserved — a failure you can see on the campaign page beats one
 * that only exists in a log line.
 */
export interface CampaignDispatchFailureResult {
  retried: boolean;
  nextAttemptAt: Date | null;
  attempts: number;
  maxAttempts: number;
}

export async function recordDispatchFailure(
  db: Database,
  params: { contactId: string; error: string; now?: Date },
): Promise<CampaignDispatchFailureResult | null> {
  const now = params.now ?? new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ contact: campaignContacts, campaign: campaigns })
      .from(campaignContacts)
      .innerJoin(campaigns, eq(campaignContacts.campaignId, campaigns.id))
      .where(eq(campaignContacts.id, params.contactId))
      .limit(1);
    if (!row || row.contact.status !== "calling") return null;

    const retried = row.contact.attempts < row.campaign.maxAttempts;
    const nextAttemptAt = retried
      ? new Date(now.getTime() + retryDelaySeconds(row.contact.attempts) * 1000)
      : null;

    const [updated] = await tx
      .update(campaignContacts)
      .set({
        status: retried ? "pending" : "failed",
        ...(nextAttemptAt ? { nextAttemptAt } : {}),
        lastError: params.error.slice(0, 1000),
      })
      .where(
        and(
          eq(campaignContacts.id, params.contactId),
          eq(campaignContacts.status, "calling"),
        ),
      )
      .returning({ id: campaignContacts.id });
    if (!updated) return null;

    await tx
      .update(campaigns)
      .set({ activeContactId: null, updatedAt: now })
      .where(
        and(
          eq(campaigns.id, row.campaign.id),
          eq(campaigns.activeContactId, params.contactId),
        ),
      );

    return {
      retried,
      nextAttemptAt,
      attempts: row.contact.attempts,
      maxAttempts: row.campaign.maxAttempts,
    };
  });
}

/**
 * Sets (or clears) the schedule and pacing for a campaign.
 *
 * Passing `scheduledAt: null` returns the campaign to a manually started
 * draft. A future date parks it in `scheduled` until the scheduler's
 * claim sees the time has passed.
 */
export async function scheduleCampaign(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    campaignId: string;
    scheduledAt: Date | null;
    dispatchIntervalSeconds: number;
    maxAttempts: number;
    now?: Date;
  },
): Promise<Campaign> {
  await requireMembership(db, params);
  const now = params.now ?? new Date();

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
  if (campaign.status === "completed") {
    throw new ConflictError("This campaign is already complete.");
  }
  if (campaign.activeContactId !== null) {
    throw new ConflictError("Wait for the current call to finish before changing the schedule.");
  }

  const status =
    params.scheduledAt === null
      ? "draft"
      : params.scheduledAt.getTime() <= now.getTime()
        ? "active"
        : "scheduled";

  const [updated] = await db
    .update(campaigns)
    .set({
      scheduledAt: params.scheduledAt,
      dispatchIntervalSeconds: params.dispatchIntervalSeconds,
      maxAttempts: params.maxAttempts,
      status,
      updatedAt: now,
    })
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.organizationId, params.organizationId),
      ),
    )
    .returning();

  return updated;
}

/**
 * Campaigns that the internal scheduler should look at right now.
 *
 * Only `scheduled` and `active` campaigns are returned: a `draft` has
 * never been started, and `paused`/`completed` are deliberate stops.
 */
export async function listDueCampaigns(
  db: Database,
  params: { now?: Date; limit?: number } = {},
): Promise<Array<{ id: string; organizationId: string }>> {
  const now = params.now ?? new Date();

  return db
    .select({ id: campaigns.id, organizationId: campaigns.organizationId })
    .from(campaigns)
    .where(
      and(
        inArray(campaigns.status, ["scheduled", "active"]),
        or(isNull(campaigns.scheduledAt), lte(campaigns.scheduledAt, now)),
        isNull(campaigns.activeContactId),
        or(
          isNull(campaigns.lastDispatchedAt),
          sql`${campaigns.lastDispatchedAt} + (${campaigns.dispatchIntervalSeconds} * interval '1 second') <= ${now}`,
        ),
      ),
    )
    .orderBy(asc(campaigns.updatedAt))
    .limit(params.limit ?? 25);
}

/**
 * Releases dispatches that were claimed but never confirmed.
 *
 * This is the crash-recovery half of the claim: if the process died
 * between "mark calling" and "Vapi accepted the call", the contact would
 * otherwise sit in `calling` forever and the campaign would stay locked.
 *
 * A call that is still ringing or in progress is deliberately NOT
 * reaped, however long ago it was dispatched — it is a real call, not a
 * wedged one.
 */
export async function reapStaleDispatches(
  db: Database,
  params: { now?: Date; staleAfterSeconds?: number } = {},
): Promise<{ reaped: number }> {
  const now = params.now ?? new Date();
  const staleAfterSeconds = params.staleAfterSeconds ?? 15 * 60;
  const cutoff = new Date(now.getTime() - staleAfterSeconds * 1000);

  const stale = await db
    .select({
      campaignId: campaigns.id,
      contactId: campaigns.activeContactId,
    })
    .from(campaigns)
    .where(
      and(
        inArray(campaigns.status, ["active", "scheduled", "paused"]),
        isNotNull(campaigns.activeContactId),
        or(
          isNull(campaigns.lastDispatchedAt),
          lte(campaigns.lastDispatchedAt, cutoff),
        ),
      ),
    )
    .limit(50);

  let reaped = 0;
  for (const row of stale) {
    if (!row.contactId) continue;

    const [liveCall] = await db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.campaignContactId, row.contactId),
          inArray(calls.status, ["ringing", "in_progress"]),
        ),
      )
      .limit(1);
    if (liveCall) continue;

    const result = await recordDispatchFailure(db, {
      contactId: row.contactId,
      error: "Dispatch timed out before the call was confirmed.",
      now,
    });

    if (result) {
      reaped += 1;
    } else {
      // The contact is no longer `calling`, so the campaign lock is just
      // dangling. Release it rather than leaving the campaign stuck.
      await db
        .update(campaigns)
        .set({ activeContactId: null, updatedAt: now })
        .where(
          and(
            eq(campaigns.id, row.campaignId),
            eq(campaigns.activeContactId, row.contactId),
          ),
        );
    }
  }

  return { reaped };
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

/**
 * Returns a paused campaign to the dispatchable state without changing
 * its schedule. Pausing is deliberate, so resuming is a separate,
 * explicit action rather than a side effect of another one.
 */
export async function resumeCampaign(
  db: Database,
  params: { organizationId: string; userId: string; campaignId: string },
): Promise<void> {
  await requireMembership(db, params);

  const [updated] = await db
    .update(campaigns)
    .set({ status: "draft", updatedAt: new Date() })
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.organizationId, params.organizationId),
        eq(campaigns.status, "paused"),
      ),
    )
    .returning({ id: campaigns.id });
  if (updated) return;

  const [campaign] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!campaign) throw new NotFoundError("Campaign");
  if (campaign.status !== "draft" && campaign.status !== "active") {
    throw new ConflictError("Only a paused campaign can be resumed.");
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
