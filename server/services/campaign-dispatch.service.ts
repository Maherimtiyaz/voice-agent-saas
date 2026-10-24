import "server-only";
import type { Call } from "@/db/schema";
import type { Database } from "@/db";
import { createOutboundCall } from "@/server/integrations/vapi/call";
import type {
  CampaignDispatch,
  CampaignDispatchOutcome,
} from "@/server/services/campaign.service";
import {
  claimNextCampaignContact,
  listDueCampaigns,
  reapStaleDispatches,
  recordDispatchFailure,
} from "@/server/services/campaign.service";
import {
  failCampaignCall,
  setCampaignCallVapiId,
  startCampaignCall,
} from "@/server/services/call.service";

/**
 * Places the provider call for a claimed contact.
 *
 * This is injectable so the scheduler can be exercised in tests without
 * reaching Vapi. Production always uses `placeViaVapi`.
 */
export interface PlaceCampaignCall {
  (dispatch: CampaignDispatch): Promise<{ vapiCallId: string }>;
}

const placeViaVapi: PlaceCampaignCall = (dispatch) =>
  createOutboundCall({
    vapiPhoneNumberId: dispatch.phoneNumber.vapiPhoneNumberId,
    assistantId: dispatch.agent.vapiAssistantId,
    customerNumber: dispatch.contact.phoneNumber,
  });

export type CampaignDispatchResult =
  | CampaignDispatchOutcome
  | {
      kind: "dispatch_failed";
      /** Why it failed, safe to show to a workspace member. */
      message: string;
      /** Whether the contact was put back in the queue for another try. */
      retried: boolean;
    };

/**
 * Claims one contact and places the call.
 *
 * The record is written before the provider request so a paid provider
 * call can never exist without a local call row. If the provider refuses
 * (or the network drops), the contact goes through the retry policy
 * instead of being silently marked done.
 */
export async function dispatchNextCampaignContact(
  db: Database,
  params: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    now?: Date;
    placeCall?: PlaceCampaignCall;
  },
): Promise<CampaignDispatchResult> {
  const outcome = await claimNextCampaignContact(db, params);
  if (outcome.kind !== "dispatched") return outcome;

  const { dispatch } = outcome;

  let call: Call;
  try {
    call = await startCampaignCall(db, {
      organizationId: params.organizationId,
      agentId: dispatch.agent.id,
      phoneNumberId: dispatch.phoneNumber.id,
      campaignContactId: dispatch.contact.id,
      fromNumber: dispatch.phoneNumber.e164Number,
      toNumber: dispatch.contact.phoneNumber,
    });
  } catch (error) {
    // The call could not even be recorded. Release the claim through the
    // same retry path as a provider failure, then surface the error.
    await recordDispatchFailure(db, {
      contactId: dispatch.contact.id,
      error:
        error instanceof Error ? error.message : "Failed to record the call.",
      now: params.now,
    });
    throw error;
  }

  let vapiCallId: string;
  try {
    vapiCallId = (await (params.placeCall ?? placeViaVapi)(dispatch)).vapiCallId;
  } catch (error) {
    console.error(
      `[campaigns] Vapi outbound call failed for campaign ${params.campaignId}`,
      error,
    );
    const failure = await failCampaignCall(db, {
      callId: call.id,
      campaignContactId: dispatch.contact.id,
      reason: "vapi_outbound_call_creation_failed",
      now: params.now,
    });

    return {
      kind: "dispatch_failed",
      retried: failure?.retried ?? false,
      message: failure?.retried
        ? "Vapi couldn't start this call. The contact was re-queued and will be retried automatically."
        : "Vapi couldn't start this call. The contact was marked failed; check the campaign contacts for details.",
    };
  }

  try {
    await setCampaignCallVapiId(db, {
      callId: call.id,
      vapiCallId,
    });
  } catch (error) {
    // Vapi DID start the call. Do not release the claim or retry: a
    // second dispatch here would ring the same person twice.
    console.error(
      `[campaigns] Vapi call ${vapiCallId} started but could not be linked to call ${call.id}`,
      error,
    );
    return {
      kind: "dispatch_failed",
      retried: false,
      message:
        "Vapi started the call, but its tracking record couldn't be updated. Do not dispatch another call until this one finishes.",
    };
  }

  return { kind: "dispatched", dispatch };
}

export interface CampaignTickResult {
  checked: number;
  dispatched: number;
  skipped: number;
  failed: number;
  reaped: number;
  campaigns: Array<{ campaignId: string; outcome: string }>;
}

/**
 * One pass of the campaign scheduler.
 *
 * Processes at most one contact per campaign, so a single misbehaving
 * campaign cannot consume the whole tick, and a failure in one campaign
 * cannot stop the others. Intended to be called by a cron route; it is
 * safe to call repeatedly, because claiming is what prevents overlap.
 */
export async function runCampaignTick(
  db: Database,
  params: {
    now?: Date;
    placeCall?: PlaceCampaignCall;
    maxCampaigns?: number;
  } = {},
): Promise<CampaignTickResult> {
  const now = params.now ?? new Date();

  const { reaped } = await reapStaleDispatches(db, { now });
  const due = await listDueCampaigns(db, {
    now,
    limit: params.maxCampaigns ?? 25,
  });

  let dispatched = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ campaignId: string; outcome: string }> = [];

  for (const campaign of due) {
    try {
      const result = await dispatchNextCampaignContact(db, {
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
        now,
        placeCall: params.placeCall,
      });

      if (result.kind === "dispatched") dispatched += 1;
      else if (result.kind === "dispatch_failed") failed += 1;
      else skipped += 1;

      results.push({ campaignId: campaign.id, outcome: result.kind });
    } catch (error) {
      // A campaign with a broken agent/number setup must not block the
      // rest of the queue. It stays due, so the next tick tries again.
      failed += 1;
      results.push({ campaignId: campaign.id, outcome: "error" });
      console.error(
        `[campaigns] tick failed for campaign ${campaign.id}`,
        error,
      );
    }
  }

  return {
    checked: due.length,
    dispatched,
    skipped,
    failed,
    reaped,
    campaigns: results,
  };
}
