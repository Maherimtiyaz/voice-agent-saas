import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { agents, phoneNumbers } from "@/db/schema";
import type { Agent, PhoneNumber } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { isUniqueViolation } from "@/server/db-errors";
import { requireMembership } from "@/server/services/organization.service";
import type { CreatePhoneNumberInput } from "@/server/validation/phone-number";


export interface PhoneNumberWithAgent extends PhoneNumber {
  agentName: string | null;
}

export async function listPhoneNumbers(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<PhoneNumberWithAgent[]> {
  await requireMembership(db, params);

  const rows = await db
    .select({
      id: phoneNumbers.id,
      organizationId: phoneNumbers.organizationId,
      agentId: phoneNumbers.agentId,
      twilioNumberSid: phoneNumbers.twilioNumberSid,
      e164Number: phoneNumbers.e164Number,
      vapiPhoneNumberId: phoneNumbers.vapiPhoneNumberId,
      status: phoneNumbers.status,
      createdAt: phoneNumbers.createdAt,
      updatedAt: phoneNumbers.updatedAt,
      agentName: agents.name,
    })
    .from(phoneNumbers)
    .leftJoin(agents, eq(phoneNumbers.agentId, agents.id))
    .where(eq(phoneNumbers.organizationId, params.organizationId));

  return rows.map((row) => ({ ...row, agentName: row.agentName ?? null }));
}

export async function createPhoneNumber(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    input: CreatePhoneNumberInput;
  },
): Promise<PhoneNumber> {
  await requireMembership(db, params);

  if (params.input.agentId) {
    await assertAgentBelongsToOrganization(db, {
      organizationId: params.organizationId,
      agentId: params.input.agentId,
    });
  }

  try {
    const [phoneNumber] = await db
      .insert(phoneNumbers)
      .values({
        organizationId: params.organizationId,
        agentId: params.input.agentId ?? null,
        twilioNumberSid: params.input.twilioNumberSid,
        e164Number: params.input.e164Number,
        vapiPhoneNumberId: params.input.vapiPhoneNumberId ?? null,
      })
      .returning();
    return phoneNumber;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "That Twilio number (or its SID) is already registered.",
      );
    }
    throw error;
  }
}

export async function assignAgentToPhoneNumber(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    phoneNumberId: string;
    agentId: string | undefined;
  },
): Promise<PhoneNumber> {
  await requireMembership(db, params);

  const [existing] = await db
    .select({ id: phoneNumbers.id })
    .from(phoneNumbers)
    .where(
      and(
        eq(phoneNumbers.id, params.phoneNumberId),
        eq(phoneNumbers.organizationId, params.organizationId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Phone number");
  }

  if (params.agentId) {
    await assertAgentBelongsToOrganization(db, {
      organizationId: params.organizationId,
      agentId: params.agentId,
    });
  }

  const [updated] = await db
    .update(phoneNumbers)
    .set({ agentId: params.agentId ?? null, updatedAt: new Date() })
    .where(eq(phoneNumbers.id, params.phoneNumberId))
    .returning();

  return updated;
}

/**
 * Prevents assigning a phone number to another organization's agent —
 * without this, an org could route calls to an agent (and its system
 * prompt/config) it doesn't own just by guessing/leaking a UUID.
 */
async function assertAgentBelongsToOrganization(
  db: Database,
  params: { organizationId: string; agentId: string },
): Promise<Agent> {
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

export interface ResolvedInboundNumber {
  phoneNumber: PhoneNumber;
  agent: Agent | null;
}

/**
 * The ONLY lookup the inbound Twilio webhook is allowed to use to
 * establish tenant identity: the dialed E.164 number, looked up against
 * OUR OWN phone_numbers table. There is no `userId`/membership check
 * here on purpose — this runs on the unauthenticated-by-session,
 * signature-verified provider webhook path, not on behalf of a logged-in
 * user. Every other service function in this file requires membership;
 * this one is the trusted system boundary that everything else hangs
 * off of at call time.
 */
export async function resolvePhoneNumberForInboundCall(
  db: Database,
  e164Number: string,
): Promise<ResolvedInboundNumber | null> {
  const [row] = await db
    .select()
    .from(phoneNumbers)
    .where(
      and(eq(phoneNumbers.e164Number, e164Number), eq(phoneNumbers.status, "active")),
    )
    .limit(1);

  if (!row) return null;

  if (!row.agentId) {
    return { phoneNumber: row, agent: null };
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, row.agentId)).limit(1);
  return { phoneNumber: row, agent: agent ?? null };
}
