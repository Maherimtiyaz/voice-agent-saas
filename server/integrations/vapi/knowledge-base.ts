import "server-only";
import { vapiRequest } from "@/server/integrations/vapi/client";

export interface VapiKnowledgeFile {
  id: string;
  status: "processing" | "done" | "failed";
}

function parseKnowledgeFile(value: unknown): VapiKnowledgeFile {
  if (typeof value !== "object" || value === null) {
    throw new Error("Vapi returned an invalid knowledge file response.");
  }
  const file = value as Record<string, unknown>;
  if (
    typeof file.id !== "string" ||
    (file.status !== "processing" && file.status !== "done" && file.status !== "failed")
  ) {
    throw new Error("Vapi returned a knowledge file without a valid id or status.");
  }
  return { id: file.id, status: file.status };
}

export async function uploadVapiKnowledgeFile(file: File): Promise<VapiKnowledgeFile> {
  const formData = new FormData();
  const safeName = (file.name.split(/[\\/]/).pop() ?? "document")
    .replace(/[^\w .-]/g, "_")
    .slice(0, 160);
  formData.append("file", file, safeName || "document");
  const response = await vapiRequest<unknown>("/file", { method: "POST", body: formData });
  return parseKnowledgeFile(response);
}

export async function getVapiKnowledgeFile(fileId: string): Promise<VapiKnowledgeFile> {
  return parseKnowledgeFile(
    await vapiRequest<unknown>(`/file/${encodeURIComponent(fileId)}`, { method: "GET" }),
  );
}

export async function deleteVapiKnowledgeFile(fileId: string): Promise<void> {
  await vapiRequest<unknown>(`/file/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}

interface VapiTool {
  id: string;
}

function parseToolId(value: unknown): string {
  if (typeof value !== "object" || value === null || typeof (value as Record<string, unknown>).id !== "string") {
    throw new Error("Vapi returned a knowledge tool without a valid id.");
  }
  return (value as Record<string, string>).id;
}

export async function syncVapiKnowledgeTool(
  agentId: string,
  fileIds: string[],
  existingToolId: string | null,
): Promise<string> {
  const payload = {
    type: "query",
    function: {
      name: `agent_knowledge_${agentId.replace(/-/g, "").slice(0, 16)}`,
      description: "Search this agent's approved company documents to answer relevant questions.",
    },
    knowledgeBases: [
      {
        provider: "google",
        name: `agent_${agentId.replace(/-/g, "").slice(0, 16)}_knowledge`,
        description: "Company documents for this voice agent.",
        fileIds,
      },
    ],
  };

  const response = existingToolId
    ? await vapiRequest<VapiTool>(`/tool/${encodeURIComponent(existingToolId)}`, {
        method: "PATCH",
        body: payload,
      })
    : await vapiRequest<VapiTool>("/tool", { method: "POST", body: payload });

  return parseToolId(response);
}

export async function deleteVapiKnowledgeTool(toolId: string): Promise<void> {
  await vapiRequest<unknown>(`/tool/${encodeURIComponent(toolId)}`, { method: "DELETE" });
}
