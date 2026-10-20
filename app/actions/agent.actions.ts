"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentContext } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import {
  addAgentKnowledgeFile,
  createAgent,
  getAgent,
  getAgentKnowledgeFile,
  listAgentKnowledgeFiles,
  removeAgentKnowledgeFile,
  setAgentKnowledgeFileStatus,
  setAgentVapiSyncState,
  updateAgentConfig,
} from "@/server/services/agent.service";
import { createAgentSchema, updateAgentConfigSchema } from "@/server/validation/agent";
import { syncAssistantWithVapi } from "@/server/integrations/vapi/assistant";
import {
  deleteVapiKnowledgeFile,
  deleteVapiKnowledgeTool,
  getVapiKnowledgeFile,
  syncVapiKnowledgeTool,
  uploadVapiKnowledgeFile,
} from "@/server/integrations/vapi/knowledge-base";
import {
  MAX_KNOWLEDGE_FILES_PER_AGENT,
  validateKnowledgeFile,
} from "@/server/validation/knowledge-base";

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
    voiceProvider: formData.get("voiceProvider"),
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
      voiceProvider: validated.data.voiceProvider,
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
  success?: string;
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
    if (agent.voiceProvider !== "vapi") {
      return { message: "Vapi sync is disabled while this agent uses OpenAI Realtime." };
    }
    let files = await listAgentKnowledgeFiles(db, {
      organizationId,
      userId: user.id,
      agentId,
    });

    await Promise.all(
      files
        .filter((file) => file.status === "processing")
        .map(async (file) => {
          const current = await getVapiKnowledgeFile(file.vapiFileId);
          await setAgentKnowledgeFileStatus(db, {
            organizationId,
            userId: user.id,
            agentId,
            fileId: file.id,
            status: current.status,
          });
        }),
    );

    files = await listAgentKnowledgeFiles(db, { organizationId, userId: user.id, agentId });
    if (files.some((file) => file.status === "processing")) {
      revalidatePath("/agents");
      return { message: "Vapi is still processing a document. Sync again when processing is complete." };
    }
    if (files.some((file) => file.status === "failed")) {
      revalidatePath("/agents");
      return { message: "A document failed processing in Vapi. Remove it before syncing this agent." };
    }

    const previousToolId = agent.vapiKnowledgeToolId;
    const knowledgeToolId = files.length
      ? await syncVapiKnowledgeTool(
          agent.id,
          files.map((file) => file.vapiFileId),
          previousToolId,
        )
      : null;

    let vapiAssistantId: string;
    try {
      vapiAssistantId = await syncAssistantWithVapi(
        agent,
        `${appUrl}/api/voice/vapi/events`,
        knowledgeToolId,
      );
    } catch (error) {
      if (knowledgeToolId && !previousToolId) {
        try {
          await deleteVapiKnowledgeTool(knowledgeToolId);
        } catch (cleanupError) {
          console.error(`[agents] Failed to remove orphaned Vapi tool ${knowledgeToolId}`, cleanupError);
        }
      }
      throw error;
    }
    if (!knowledgeToolId && previousToolId) {
      await deleteVapiKnowledgeTool(previousToolId);
    }
    await setAgentVapiSyncState(db, {
      organizationId,
      userId: user.id,
      agentId,
      vapiAssistantId,
      vapiKnowledgeToolId: knowledgeToolId,
    });
  } catch (error) {
    if (error instanceof AppError) {
      revalidatePath("/agents");
      return { message: error.message };
    }
    console.error(`[agents] Vapi sync failed for agent ${agentId}`, error);
    revalidatePath("/agents");
    return { message: "Couldn't sync this agent to Vapi. Check server logs for details." };
  }

  revalidatePath("/agents");
  return { success: "Agent synced to Vapi." };
}

export interface KnowledgeFileActionState {
  message?: string;
  success?: string;
}

export async function uploadAgentKnowledgeFileAction(
  _prevState: KnowledgeFileActionState | undefined,
  formData: FormData,
): Promise<KnowledgeFileActionState> {
  const agentId = formData.get("agentId");
  const file = formData.get("file");
  if (typeof agentId !== "string" || !agentId) {
    return { message: "Missing agent id." };
  }
  if (!(file instanceof File)) {
    return { message: "Choose a document to upload." };
  }
  const validationError = validateKnowledgeFile(file);
  if (validationError) {
    return { message: validationError };
  }

  const { user, organizationId } = await requireCurrentContext();
  let remoteFileId: string | undefined;
  try {
    await getAgent(db, { organizationId, userId: user.id, agentId });
    const currentFiles = await listAgentKnowledgeFiles(db, {
      organizationId,
      userId: user.id,
      agentId,
    });
    if (currentFiles.length >= MAX_KNOWLEDGE_FILES_PER_AGENT) {
      return {
        message: `An agent can have at most ${MAX_KNOWLEDGE_FILES_PER_AGENT} knowledge documents.`,
      };
    }

    const remoteFile = await uploadVapiKnowledgeFile(file);
    remoteFileId = remoteFile.id;
    const safeName = (file.name.split(/[\\/]/).pop() ?? "document")
      .replace(/[^\w .-]/g, "_")
      .slice(0, 160);
    await addAgentKnowledgeFile(db, {
      organizationId,
      userId: user.id,
      agentId,
      vapiFileId: remoteFile.id,
      name: safeName || "document",
      bytes: file.size,
      status: remoteFile.status,
    });
  } catch (error) {
    if (remoteFileId) {
      try {
        await deleteVapiKnowledgeFile(remoteFileId);
      } catch (cleanupError) {
        console.error(`[agents] Failed to remove orphaned Vapi file ${remoteFileId}`, cleanupError);
      }
    }
    if (error instanceof AppError) {
      return { message: error.message };
    }
    console.error(`[agents] Knowledge file upload failed for agent ${agentId}`, error);
    return { message: "Couldn't upload this document. Check server logs for details." };
  }

  revalidatePath("/agents");
  return { success: "Document uploaded. Sync the agent to refresh its processing status." };
}

export async function removeAgentKnowledgeFileAction(
  _prevState: KnowledgeFileActionState | undefined,
  formData: FormData,
): Promise<KnowledgeFileActionState> {
  const agentId = formData.get("agentId");
  const fileId = formData.get("fileId");
  if (typeof agentId !== "string" || !agentId || typeof fileId !== "string" || !fileId) {
    return { message: "Missing agent or document id." };
  }

  const { user, organizationId } = await requireCurrentContext();
  try {
    const file = await getAgentKnowledgeFile(db, {
      organizationId,
      userId: user.id,
      agentId,
      fileId,
    });
    await deleteVapiKnowledgeFile(file.vapiFileId);
    await removeAgentKnowledgeFile(db, {
      organizationId,
      userId: user.id,
      agentId,
      fileId,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    console.error(`[agents] Knowledge file removal failed for agent ${agentId}`, error);
    return { message: "Couldn't remove this document. Check server logs for details." };
  }

  revalidatePath("/agents");
  return { success: "Document removed. Sync the agent to update its knowledge tool." };
}
