"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentContext } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import {
  dispatchNextCampaignContact,
} from "@/server/services/campaign-dispatch.service";
import type { CampaignDispatchResult } from "@/server/services/campaign-dispatch.service";
import {
  addCampaignContacts,
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  scheduleCampaign,
} from "@/server/services/campaign.service";
import {
  addCampaignContactsSchema,
  createCampaignSchema,
  scheduleCampaignSchema,
} from "@/server/validation/campaign";

export interface CampaignActionState {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
}

/**
 * Turns a dispatch outcome into something a workspace member can act on.
 *
 * "Throttled" and "scheduled" are success states, not failures: the
 * campaign is doing exactly what it was configured to do.
 */
function describeDispatch(result: CampaignDispatchResult): CampaignActionState {
  switch (result.kind) {
    case "dispatched":
      return {
        success: true,
        message: `Calling ${result.dispatch.contact.phoneNumber}. Wait for this call to finish before starting the next one.`,
      };
    case "throttled":
      return {
        success: true,
        message: `Pacing: the next call is allowed after ${result.nextEligibleAt.toISOString()}.`,
      };
    case "scheduled":
      return {
        success: true,
        message: `This campaign is scheduled to start at ${result.startsAt.toISOString()}.`,
      };
    case "busy":
      return {
        success: true,
        message: "A call is already in progress. Wait for it to finish.",
      };
    case "paused":
      return {
        success: false,
        message: "This campaign is paused. Resume it before dispatching.",
      };
    case "exhausted":
      return {
        success: true,
        message: "No pending contacts remain. The campaign is complete.",
      };
    case "dispatch_failed":
      return { message: result.message };
  }
}

export async function createCampaignAction(
  _prevState: CampaignActionState | undefined,
  formData: FormData,
): Promise<CampaignActionState> {
  const validated = createCampaignSchema.safeParse({
    name: formData.get("name"),
    agentId: formData.get("agentId"),
    phoneNumberId: formData.get("phoneNumberId"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext();
  try {
    await createCampaign(db, {
      organizationId,
      userId: user.id,
      input: validated.data,
    });
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }

  revalidatePath("/campaigns");
  return { success: true };
}

export async function addCampaignContactsAction(
  _prevState: CampaignActionState | undefined,
  formData: FormData,
): Promise<CampaignActionState> {
  const validated = addCampaignContactsSchema.safeParse({
    campaignId: formData.get("campaignId"),
    phoneNumbers: formData.get("phoneNumbers"),
    consentConfirmed: formData.get("consentConfirmed"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext();
  try {
    const result = await addCampaignContacts(db, {
      organizationId,
      userId: user.id,
      input: validated.data,
    });
    revalidatePath(`/campaigns/${validated.data.campaignId}`);
    revalidatePath("/campaigns");
    revalidatePath("/calls");
    return {
      success: true,
      message: `Added ${result.added} contact${result.added === 1 ? "" : "s"}; skipped ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }
}

export async function scheduleCampaignAction(
  _prevState: CampaignActionState | undefined,
  formData: FormData,
): Promise<CampaignActionState> {
  const validated = scheduleCampaignSchema.safeParse({
    campaignId: formData.get("campaignId"),
    scheduledAt: formData.get("scheduledAt"),
    dispatchIntervalSeconds: formData.get("dispatchIntervalSeconds"),
    maxAttempts: formData.get("maxAttempts"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext();
  try {
    const campaign = await scheduleCampaign(db, {
      organizationId,
      userId: user.id,
      campaignId: validated.data.campaignId,
      scheduledAt: validated.data.scheduledAt,
      dispatchIntervalSeconds: validated.data.dispatchIntervalSeconds,
      maxAttempts: validated.data.maxAttempts,
    });

    revalidatePath(`/campaigns/${campaign.id}`);
    revalidatePath("/campaigns");
    return {
      success: true,
      message:
        campaign.status === "scheduled"
          ? `Scheduled to start at ${campaign.scheduledAt?.toISOString()}.`
          : campaign.status === "active"
            ? "Scheduling saved. The campaign is eligible to start now."
            : "Scheduling removed. Start the campaign manually when you're ready.",
    };
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }
}

export async function startCampaignCallAction(
  _prevState: CampaignActionState | undefined,
  formData: FormData,
): Promise<CampaignActionState> {
  const campaignId = formData.get("campaignId");
  if (typeof campaignId !== "string" || !campaignId) {
    return { message: "Missing campaign id." };
  }

  const { user, organizationId } = await requireCurrentContext();
  let result: CampaignDispatchResult;
  try {
    result = await dispatchNextCampaignContact(db, {
      organizationId,
      campaignId,
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  revalidatePath("/calls");
  return describeDispatch(result);
}

export async function pauseCampaignAction(
  _prevState: CampaignActionState | undefined,
  formData: FormData,
): Promise<CampaignActionState> {
  const campaignId = formData.get("campaignId");
  if (typeof campaignId !== "string" || !campaignId) {
    return { message: "Missing campaign id." };
  }

  const { user, organizationId } = await requireCurrentContext();
  try {
    await pauseCampaign(db, { organizationId, userId: user.id, campaignId });
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { success: true, message: "Campaign paused. Any current call will be allowed to finish." };
}

export async function resumeCampaignAction(
  _prevState: CampaignActionState | undefined,
  formData: FormData,
): Promise<CampaignActionState> {
  const campaignId = formData.get("campaignId");
  if (typeof campaignId !== "string" || !campaignId) {
    return { message: "Missing campaign id." };
  }

  const { user, organizationId } = await requireCurrentContext();
  try {
    await resumeCampaign(db, { organizationId, userId: user.id, campaignId });
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { success: true, message: "Campaign resumed. It will be dispatched on the next scheduler tick." };
}
