import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { agentKnowledgeFiles, agents } from "@/db/schema";
import type { Agent, AgentKnowledgeFile, KnowledgeFileStatus } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { requireMembership } from "@/server/services/organization.service";
import type { CreateAgentInput } from "@/server/validation/agent";
import { MAX_KNOWLEDGE_FILES_PER_AGENT } from "@/server/validation/knowledge-base";

/**
 * Every function here takes the acting user's id and re-checks
 * membership itself — it never trusts that the caller already did
 * this. That's what makes it safe to call from any entry point
 * (Server Action, Route Handler, future public API) without relying
 * on each caller to remember the check.
 */

export async function listAgents(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<Agent[]> {
  await requireMembership(db, params);

  return db
    .select()
    .from(agents)
    .where(eq(agents.organizationId, params.organizationId))
    .orderBy(desc(agents.createdAt));
}

export async function createAgent(
  db: Database,
  params: { organizationId: string; userId: string; input: CreateAgentInput },
): Promise<Agent> {
  await requireMembership(db, params);

  const [agent] = await db
    .insert(agents)
    .values({ organizationId: params.organizationId, name: params.input.name })
    .returning();

  return agent;
}

export async function getAgent(
  db: Database,
  params: { organizationId: string; userId: string; agentId: string },
): Promise<Agent> {
  await requireMembership(db, params);

  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.id, params.agentId), eq(agents.organizationId, params.organizationId)),
    )
    .limit(1);

  if (!agent) {
    throw new NotFoundError("Agent");
  }

  return agent;
}

export async function setAgentVapiSyncState(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    agentId: string;
    vapiAssistantId: string;
    vapiKnowledgeToolId: string | null;
  },
): Promise<Agent> {
  // getAgent already enforces membership + org ownership of this agent id.
  await getAgent(db, params);

  const [updated] = await db
    .update(agents)
    .set({
      vapiAssistantId: params.vapiAssistantId,
      vapiKnowledgeToolId: params.vapiKnowledgeToolId,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, params.agentId))
    .returning();

  return updated;
}

export async function listAgentKnowledgeFiles(
  db: Database,
  params: { organizationId: string; userId: string; agentId: string },
): Promise<AgentKnowledgeFile[]> {
  await getAgent(db, params);
  return db
    .select()
    .from(agentKnowledgeFiles)
    .where(
      and(
        eq(agentKnowledgeFiles.organizationId, params.organizationId),
        eq(agentKnowledgeFiles.agentId, params.agentId),
      ),
    )
    .orderBy(desc(agentKnowledgeFiles.createdAt));
}

export async function addAgentKnowledgeFile(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    agentId: string;
    vapiFileId: string;
    name: string;
    bytes: number;
    status: KnowledgeFileStatus;
  },
): Promise<AgentKnowledgeFile> {
  await getAgent(db, params);
  const existing = await db
    .select({ id: agentKnowledgeFiles.id })
    .from(agentKnowledgeFiles)
    .where(
      and(
        eq(agentKnowledgeFiles.organizationId, params.organizationId),
        eq(agentKnowledgeFiles.agentId, params.agentId),
      ),
    )
    .limit(MAX_KNOWLEDGE_FILES_PER_AGENT);
  if (existing.length >= MAX_KNOWLEDGE_FILES_PER_AGENT) {
    throw new ConflictError(`An agent can have at most ${MAX_KNOWLEDGE_FILES_PER_AGENT} knowledge documents.`);
  }

  const [file] = await db
    .insert(agentKnowledgeFiles)
    .values({
      organizationId: params.organizationId,
      agentId: params.agentId,
      vapiFileId: params.vapiFileId,
      name: params.name,
      bytes: params.bytes,
      status: params.status,
    })
    .returning();
  return file;
}

export async function setAgentKnowledgeFileStatus(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    agentId: string;
    fileId: string;
    status: KnowledgeFileStatus;
  },
): Promise<void> {
  await getAgent(db, params);
  const [updated] = await db
    .update(agentKnowledgeFiles)
    .set({ status: params.status })
    .where(
      and(
        eq(agentKnowledgeFiles.id, params.fileId),
        eq(agentKnowledgeFiles.organizationId, params.organizationId),
        eq(agentKnowledgeFiles.agentId, params.agentId),
      ),
    )
    .returning({ id: agentKnowledgeFiles.id });
  if (!updated) {
    throw new NotFoundError("Knowledge document");
  }
}

export async function getAgentKnowledgeFile(
  db: Database,
  params: { organizationId: string; userId: string; agentId: string; fileId: string },
): Promise<AgentKnowledgeFile> {
  await getAgent(db, params);
  const [file] = await db
    .select()
    .from(agentKnowledgeFiles)
    .where(
      and(
        eq(agentKnowledgeFiles.id, params.fileId),
        eq(agentKnowledgeFiles.organizationId, params.organizationId),
        eq(agentKnowledgeFiles.agentId, params.agentId),
      ),
    )
    .limit(1);
  if (!file) {
    throw new NotFoundError("Knowledge document");
  }
  return file;
}

export async function removeAgentKnowledgeFile(
  db: Database,
  params: { organizationId: string; userId: string; agentId: string; fileId: string },
): Promise<void> {
  await getAgentKnowledgeFile(db, params);
  await db
    .delete(agentKnowledgeFiles)
    .where(
      and(
        eq(agentKnowledgeFiles.id, params.fileId),
        eq(agentKnowledgeFiles.organizationId, params.organizationId),
        eq(agentKnowledgeFiles.agentId, params.agentId),
      ),
    );
}

export async function updateAgentConfig(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    agentId: string;
    systemPrompt?: string;
    transferNumber?: string;
    voiceProvider: Agent["voiceProvider"];
  },
): Promise<Agent> {
  // getAgent already enforces membership + org ownership of this agent id.
  await getAgent(db, params);

  const [updated] = await db
    .update(agents)
    .set({
      systemPrompt: params.systemPrompt ?? null,
      transferNumber: params.transferNumber ?? null,
      voiceProvider: params.voiceProvider,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, params.agentId))
    .returning();

  return updated;
}
