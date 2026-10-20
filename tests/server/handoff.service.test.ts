import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agents, calls, callHandoffs, organizations, phoneNumbers } from "@/db/schema";
import {
  createCallHandoff,
  finishCallHandoff,
  getCallHandoffContext,
  listCallHandoffs,
  markCallHandoffConnected,
} from "@/server/services/handoff.service";

let db: TestDatabase;

async function seedCall() {
  const [organization] = await db
    .insert(organizations)
    .values({ name: "Handoff workspace", slug: `handoff-${crypto.randomUUID()}` })
    .returning();
  const [agent] = await db
    .insert(agents)
    .values({ organizationId: organization.id, name: "Front desk" })
    .returning();
  const [phoneNumber] = await db
    .insert(phoneNumbers)
    .values({
      organizationId: organization.id,
      agentId: agent.id,
      twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "").slice(0, 30)}`,
      e164Number: `+1415555${Math.floor(1000 + Math.random() * 8999)}`,
    })
    .returning();
  const [call] = await db
    .insert(calls)
    .values({
      organizationId: organization.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: `CA${crypto.randomUUID().replace(/-/g, "").slice(0, 30)}`,
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    })
    .returning();
  return { organization, call };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("call handoffs", () => {
  it("scopes provider callback lookups to the original Twilio call and advances the lifecycle", async () => {
    const { organization, call } = await seedCall();
    const handoff = await createCallHandoff(db, {
      organizationId: organization.id,
      callId: call.id,
      destinationNumber: "+14155550199",
      reason: "Billing question",
      summary: "Caller needs help understanding an invoice.",
    });

    expect(
      await getCallHandoffContext(db, {
        handoffId: handoff.id,
        twilioCallSid: "CA-unrelated",
      }),
    ).toBeNull();
    expect(
      await markCallHandoffConnected(db, {
        handoffId: handoff.id,
        twilioCallSid: call.twilioCallSid!,
      }),
    ).toBe(true);
    expect(
      await markCallHandoffConnected(db, {
        handoffId: handoff.id,
        twilioCallSid: call.twilioCallSid!,
      }),
    ).toBe(false);
    expect(
      await finishCallHandoff(db, {
        handoffId: handoff.id,
        twilioCallSid: call.twilioCallSid!,
        status: "completed",
      }),
    ).toBe(true);
    expect(
      await finishCallHandoff(db, {
        handoffId: handoff.id,
        twilioCallSid: call.twilioCallSid!,
        status: "failed",
      }),
    ).toBe(false);

    const [stored] = await db
      .select()
      .from(callHandoffs)
      .where(eq(callHandoffs.id, handoff.id));
    expect(stored.status).toBe("completed");
    expect(stored.answeredAt).toBeInstanceOf(Date);
    expect(stored.endedAt).toBeInstanceOf(Date);
  });

  it("lists handoffs only for the call and workspace requested", async () => {
    const first = await seedCall();
    const second = await seedCall();
    await createCallHandoff(db, {
      organizationId: first.organization.id,
      callId: first.call.id,
      destinationNumber: "+14155550199",
      summary: "First handoff.",
    });
    await createCallHandoff(db, {
      organizationId: second.organization.id,
      callId: second.call.id,
      destinationNumber: "+14155550299",
      summary: "Second handoff.",
    });

    const handoffs = await listCallHandoffs(db, {
      organizationId: first.organization.id,
      callId: first.call.id,
    });
    expect(handoffs.map(({ summary }) => summary)).toEqual(["First handoff."]);
  });
});
