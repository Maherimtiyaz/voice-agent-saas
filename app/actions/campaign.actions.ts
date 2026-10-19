"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentContext } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { createOutboundCall } from "@/server/integrations/vapi/call";
import {
  addCampaignContacts,
  createCampaign,
  finishCampaignContact,
  pauseCampaign,
  reserveNextCampaignContact,
} from "@/server/services/campaign.service";
import {
  failCampaignCall,
  setCampaignCallVapiId,
  startCampaignCall,
} from "@/server/services/call.service";
import {
  addCampaignContactsSchema,
  createCampaignSchema,
} from "@/server/validation/campaign";

export interface CampaignActionState {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
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

export async function startCampaignCallAction(
  _prevState: CampaignActionState | undefined,
  formData: FormData,
): Promise<CampaignActionState> {
  const campaignId = formData.get("campaignId");
  if (typeof campaignId !== "string" || !campaignId) {
    return { message: "Missing campaign id." };
  }

  const { user, organizationId } = await requireCurrentContext();
  let dispatch;
  try {
    dispatch = await reserveNextCampaignContact(db, {
      organizationId,
      userId: user.id,
      campaignId,
    });
  } catch (error) {
    if (error instanceof AppError) return { message: error.message };
    throw error;
  }

  if (!dispatch) {
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
    return { success: true, message: "No pending contacts remain. The campaign is complete." };
  }

  let call;
  try {
    call = await startCampaignCall(db, {
      organizationId,
      agentId: dispatch.agent.id,
      phoneNumberId: dispatch.phoneNumber.id,
      campaignContactId: dispatch.contact.id,
      fromNumber: dispatch.phoneNumber.e164Number,
      toNumber: dispatch.contact.phoneNumber,
    });
  } catch (error) {
    console.error(`[campaigns] failed to record dispatch for campaign ${campaignId}`, error);
    try {
      await finishCampaignContact(db, {
        contactId: dispatch.contact.id,
        status: "failed",
      });
    } catch (recordError) {
      console.error(
        `[campaigns] failed to release contact ${dispatch.contact.id} after record failure`,
        recordError,
      );
    }
    throw error;
  }

  let outboundCall: { vapiCallId: string };
  try {
    outboundCall = await createOutboundCall({
      vapiPhoneNumberId: dispatch.phoneNumber.vapiPhoneNumberId,
      assistantId: dispatch.agent.vapiAssistantId,
      customerNumber: dispatch.contact.phoneNumber,
    });
  } catch (error) {
    console.error(`[campaigns] Vapi outbound call failed for campaign ${campaignId}`, error);
    try {
      await failCampaignCall(db, {
        callId: call.id,
        campaignContactId: dispatch.contact.id,
        reason: "vapi_outbound_call_creation_failed",
      });
    } catch (recordError) {
      console.error(`[campaigns] failed to record outbound call failure for ${call.id}`, recordError);
    }
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/calls");
    return {
      message: "Vapi couldn't start this call. The contact was marked failed; check server logs for details.",
    };
  }

  try {
    await setCampaignCallVapiId(db, {
      callId: call.id,
      vapiCallId: outboundCall.vapiCallId,
    });
  } catch (error) {
    console.error(
      `[campaigns] Vapi call ${outboundCall.vapiCallId} started but could not be linked to call ${call.id}`,
      error,
    );
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/calls");
    return {
      message: "Vapi started the call, but its tracking record couldn't be updated. Do not dispatch another call until this one finishes.",
    };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/calls");
  return {
    success: true,
    message: `Calling ${dispatch.contact.phoneNumber}. Wait for this call to finish before starting the next one.`,
  };
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
