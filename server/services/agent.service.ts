import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { agents } from "@/db/schema";
import type { Agent } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { requireMembership } from "@/server/services/organization.service";
import type { CreateAgentInput } from "@/server/validation/agent";

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

export async function setAgentVapiAssistantId(
  db: Database,
  params: { organizationId: string; userId: string; agentId: string; vapiAssistantId: string },
): Promise<Agent> {
  // getAgent already enforces membership + org ownership of this agent id.
  await getAgent(db, params);

  const [updated] = await db
    .update(agents)
    .set({ vapiAssistantId: params.vapiAssistantId, updatedAt: new Date() })
    .where(eq(agents.id, params.agentId))
    .returning();

  return updated;
}

export async function updateAgentConfig(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    agentId: string;
    systemPrompt?: string;
    transferNumber?: string;
  },
): Promise<Agent> {
  // getAgent already enforces membership + org ownership of this agent id.
  await getAgent(db, params);

  const [updated] = await db
    .update(agents)
    .set({
      systemPrompt: params.systemPrompt ?? null,
      transferNumber: params.transferNumber ?? null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, params.agentId))
    .returning();

  return updated;
}
