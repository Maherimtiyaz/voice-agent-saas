"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentContext } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { createAgent, getAgent, setAgentVapiAssistantId, updateAgentConfig } from "@/server/services/agent.service";
import { createAgentSchema, updateAgentConfigSchema } from "@/server/validation/agent";
import { syncAssistantWithVapi } from "@/server/integrations/vapi/assistant";

export interface AgentFormState {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
}

export async function createAgentAction(
  _prevState: AgentFormState | undefined,
  formData: FormData,
): Promise<AgentFormState> {
  const validated = createAgentSchema.safeParse({ name: formData.get("name") });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext();

  try {
    await createAgent(db, { organizationId, userId: user.id, input: validated.data });
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath("/agents");
  return { success: true };
}

export interface UpdateAgentConfigFormState {
  errors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
}

/**
 * Sets the system prompt (spoken/reasoning behavior) and transfer
 * number (the ONLY destination transfer_call is ever allowed to use —
 * see server/tools/definitions/transfer-call.ts). Neither field is
 * pushed to Vapi automatically; "Sync to Vapi" picks up the current
 * system prompt the next time it's clicked.
 */
export async function updateAgentConfigAction(
  _prevState: UpdateAgentConfigFormState | undefined,
  formData: FormData,
): Promise<UpdateAgentConfigFormState> {
  const agentId = formData.get("agentId");
  if (typeof agentId !== "string" || agentId.length === 0) {
    return { message: "Missing agent id." };
  }

  const validated = updateAgentConfigSchema.safeParse({
    systemPrompt: formData.get("systemPrompt"),
    transferNumber: formData.get("transferNumber"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext();

  try {
    await updateAgentConfig(db, {
      organizationId,
      userId: user.id,
      agentId,
      systemPrompt: validated.data.systemPrompt,
      transferNumber: validated.data.transferNumber,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath("/agents");
  return { success: true };
}

export interface SyncAgentFormState {
  message?: string;
}

/**
 * Explicit, manually-triggered sync — NOT run automatically on every
 * agent create/update. This calls the real Vapi API (POST/PATCH
 * /assistant); it was never exercised against a live Vapi account in
 * development (no credentials available there — see README), so
 * surfacing errors directly here, rather than swallowing them, matters.
 */
export async function syncAgentWithVapiAction(
  _prevState: SyncAgentFormState | undefined,
  formData: FormData,
): Promise<SyncAgentFormState> {
  const agentId = formData.get("agentId");
  if (typeof agentId !== "string" || agentId.length === 0) {
    return { message: "Missing agent id." };
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return { message: "APP_URL is not configured on the server." };
  }

  const { user, organizationId } = await requireCurrentContext();

  try {
    const agent = await getAgent(db, { organizationId, userId: user.id, agentId });
    const vapiAssistantId = await syncAssistantWithVapi(
      agent,
      `${appUrl}/api/voice/vapi/events`,
    );
    await setAgentVapiAssistantId(db, {
      organizationId,
      userId: user.id,
      agentId,
      vapiAssistantId,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    console.error(`[agents] Vapi sync failed for agent ${agentId}`, error);
    return { message: "Couldn't sync this agent to Vapi. Check server logs for details." };
  }

  revalidatePath("/agents");
  return {};
}
