import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import {
  agents,
  callTranscripts,
  calls,
  phoneNumbers,
} from "@/db/schema";
import type { CallOutcome, CallStatus } from "@/db/schema";

export interface PublicPage<T> {
  data: T[];
  hasMore: boolean;
}

export async function listPublicAgents(
  db: Database,
  organizationId: string,
) {
  return db
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      language: agents.language,
      status: agents.status,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(eq(agents.organizationId, organizationId))
    .orderBy(desc(agents.createdAt));
}

export async function listPublicPhoneNumbers(
  db: Database,
  organizationId: string,
) {
  return db
    .select({
      id: phoneNumbers.id,
      agentId: agents.id,
      e164Number: phoneNumbers.e164Number,
      status: phoneNumbers.status,
      createdAt: phoneNumbers.createdAt,
      updatedAt: phoneNumbers.updatedAt,
    })
    .from(phoneNumbers)
    .leftJoin(
      agents,
      and(
        eq(phoneNumbers.agentId, agents.id),
        eq(phoneNumbers.organizationId, agents.organizationId),
      ),
    )
    .where(eq(phoneNumbers.organizationId, organizationId))
    .orderBy(desc(phoneNumbers.createdAt));
}

export async function listPublicCalls(
  db: Database,
  params: { organizationId: string; limit: number; offset: number },
): Promise<PublicPage<{
  id: string;
  agentId: string;
  agentName: string;
  phoneNumberId: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  status: CallStatus;
  outcome: CallOutcome | null;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
}>> {
  const rows = await db
    .select({
      id: calls.id,
      agentId: calls.agentId,
      agentName: agents.name,
      phoneNumberId: calls.phoneNumberId,
      registeredNumber: phoneNumbers.e164Number,
      fromNumber: calls.fromNumber,
      toNumber: calls.toNumber,
      status: calls.status,
      outcome: calls.outcome,
      startedAt: calls.startedAt,
      answeredAt: calls.answeredAt,
      endedAt: calls.endedAt,
      durationSeconds: calls.durationSeconds,
    })
    .from(calls)
    .innerJoin(
      agents,
      and(eq(calls.agentId, agents.id), eq(calls.organizationId, agents.organizationId)),
    )
    .innerJoin(
      phoneNumbers,
      and(
        eq(calls.phoneNumberId, phoneNumbers.id),
        eq(calls.organizationId, phoneNumbers.organizationId),
      ),
    )
    .where(eq(calls.organizationId, params.organizationId))
    .orderBy(desc(calls.startedAt))
    .limit(params.limit + 1)
    .offset(params.offset);

  const hasMore = rows.length > params.limit;
  return {
    data: rows.slice(0, params.limit).map(({ registeredNumber, ...call }) => ({
      ...call,
      direction: call.fromNumber === registeredNumber ? "outbound" : "inbound",
    })),
    hasMore,
  };
}

export async function getPublicCallDetail(
  db: Database,
  params: { organizationId: string; callId: string },
) {
  const [call] = await db
    .select({
      id: calls.id,
      agentId: calls.agentId,
      agentName: agents.name,
      phoneNumberId: calls.phoneNumberId,
      phoneNumber: phoneNumbers.e164Number,
      fromNumber: calls.fromNumber,
      toNumber: calls.toNumber,
      status: calls.status,
      endedReason: calls.endedReason,
      outcome: calls.outcome,
      startedAt: calls.startedAt,
      answeredAt: calls.answeredAt,
      endedAt: calls.endedAt,
      durationSeconds: calls.durationSeconds,
    })
    .from(calls)
    .innerJoin(
      agents,
      and(eq(calls.agentId, agents.id), eq(calls.organizationId, agents.organizationId)),
    )
    .innerJoin(
      phoneNumbers,
      and(
        eq(calls.phoneNumberId, phoneNumbers.id),
        eq(calls.organizationId, phoneNumbers.organizationId),
      ),
    )
    .where(
      and(
        eq(calls.id, params.callId),
        eq(calls.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!call) return null;

  const transcripts = await db
    .select({
      role: callTranscripts.role,
      content: callTranscripts.content,
      timestamp: callTranscripts.timestamp,
      sequenceNumber: callTranscripts.sequenceNumber,
    })
    .from(callTranscripts)
    .where(eq(callTranscripts.callId, call.id))
    .orderBy(callTranscripts.sequenceNumber);

  return {
    ...call,
    direction: call.fromNumber === call.phoneNumber ? "outbound" as const : "inbound" as const,
    transcripts,
  };
}
