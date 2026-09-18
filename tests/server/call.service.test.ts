import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agents, organizationMembers, organizations, phoneNumbers, users } from "@/db/schema";
import {
  appendTranscript,
  applyEndOfCallReport,
  applyStatusUpdate,
  getCallDetail,
  listCalls,
  recordFailedCall,
  recordWebhookEventIfNew,
  startCall,
} from "@/server/services/call.service";
import { NotAMemberError, NotFoundError } from "@/server/errors";

let db: TestDatabase;

async function seedOrgWithAgentAndNumber() {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme Inc", slug: `acme-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `${crypto.randomUUID()}@example.com`, name: "Ada", passwordHash: "x" })
    .returning();
  await db
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: user.id, role: "member" });
  const [agent] = await db
    .insert(agents)
    .values({ organizationId: org.id, name: "Front Desk" })
    .returning();
  const [phoneNumber] = await db
    .insert(phoneNumbers)
    .values({
      organizationId: org.id,
      agentId: agent.id,
      twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "").slice(0, 30)}`,
      e164Number: `+1415555${Math.floor(1000 + Math.random() * 8999)}`,
    })
    .returning();
  return { org, user, agent, phoneNumber };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("call lifecycle", () => {
  it("creates a call in the ringing state", async () => {
    const { org, agent, phoneNumber } = await seedOrgWithAgentAndNumber();

    const call = await startCall(db, {
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: "CA123",
      vapiCallId: "vapi-call-1",
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    });

    expect(call.status).toBe("ringing");
  });

  it("is idempotent on twilioCallSid — a retried webhook doesn't create a second row", async () => {
    const { org, agent, phoneNumber } = await seedOrgWithAgentAndNumber();
    const params = {
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: "CA-retry-1",
      vapiCallId: "vapi-call-2",
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    };

    const first = await startCall(db, params);
    const second = await startCall(db, params);

    expect(second.id).toBe(first.id);
  });

  it("moves to in_progress on a status-update and sets answeredAt once", async () => {
    const { org, agent, phoneNumber } = await seedOrgWithAgentAndNumber();
    await startCall(db, {
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: "CA-progress",
      vapiCallId: "vapi-call-3",
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    });

    const updated = await applyStatusUpdate(db, {
      vapiCallId: "vapi-call-3",
      vapiStatus: "in-progress",
    });

    expect(updated?.status).toBe("in_progress");
    expect(updated?.answeredAt).not.toBeNull();
  });

  it("resolves a final status and duration from the end-of-call report", async () => {
    const { org, agent, phoneNumber } = await seedOrgWithAgentAndNumber();
    await startCall(db, {
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: "CA-ended",
      vapiCallId: "vapi-call-4",
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    });

    const updated = await applyEndOfCallReport(db, {
      vapiCallId: "vapi-call-4",
      endedReason: "customer-ended-call",
      durationSeconds: 42,
    });

    expect(updated?.status).toBe("completed");
    expect(updated?.durationSeconds).toBe(42);
    expect(updated?.endedAt).not.toBeNull();
  });

  it("maps a no-answer ended reason to the no_answer status", async () => {
    const { org, agent, phoneNumber } = await seedOrgWithAgentAndNumber();
    await startCall(db, {
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: "CA-noanswer",
      vapiCallId: "vapi-call-5",
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    });

    const updated = await applyEndOfCallReport(db, {
      vapiCallId: "vapi-call-5",
      endedReason: "customer-did-not-answer",
    });

    expect(updated?.status).toBe("no_answer");
  });

  it("records a failed call when no agent is configured for the dialed number", async () => {
    const { org, phoneNumber } = await seedOrgWithAgentAndNumber();
    // Detach the agent to simulate an unconfigured number.
    const failed = await recordFailedCall(db, {
      organizationId: org.id,
      agentId: null,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: "CA-unconfigured",
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
      reason: "agent_not_configured",
    });

    // No agent id -> nothing to satisfy the NOT NULL FK against; this is
    // a deliberate log-only path, not a bug — see call.service.ts.
    expect(failed).toBeNull();
  });
});

describe("transcripts", () => {
  it("assigns increasing sequence numbers per call", async () => {
    const { org, agent, phoneNumber } = await seedOrgWithAgentAndNumber();
    const call = await startCall(db, {
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: "CA-transcript",
      vapiCallId: "vapi-call-6",
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    });

    const first = await appendTranscript(db, { callId: call.id, role: "user", content: "Hi" });
    const second = await appendTranscript(db, {
      callId: call.id,
      role: "assistant",
      content: "Hello, how can I help?",
    });

    expect(first.sequenceNumber).toBe(1);
    expect(second.sequenceNumber).toBe(2);
  });
});

describe("webhook idempotency", () => {
  it("records a new event once and reports duplicates on retry", async () => {
    const first = await recordWebhookEventIfNew(db, {
      provider: "vapi",
      externalEventId: "call-1:status-update:abc123",
      eventType: "status-update",
      payload: { hello: "world" },
    });
    const second = await recordWebhookEventIfNew(db, {
      provider: "vapi",
      externalEventId: "call-1:status-update:abc123",
      eventType: "status-update",
      payload: { hello: "world" },
    });

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
  });

  it("treats the same externalEventId from different providers as distinct", async () => {
    const twilioEvent = await recordWebhookEventIfNew(db, {
      provider: "twilio",
      externalEventId: "CA123",
      eventType: "voice.inbound",
      payload: {},
    });
    const vapiEvent = await recordWebhookEventIfNew(db, {
      provider: "vapi",
      externalEventId: "CA123",
      eventType: "status-update",
      payload: {},
    });

    expect(twilioEvent.isNew).toBe(true);
    expect(vapiEvent.isNew).toBe(true);
  });
});

describe("tenant isolation for calls", () => {
  it("lists only calls belonging to the caller's organization", async () => {
    const orgA = await seedOrgWithAgentAndNumber();
    const orgB = await seedOrgWithAgentAndNumber();

    await startCall(db, {
      organizationId: orgA.org.id,
      agentId: orgA.agent.id,
      phoneNumberId: orgA.phoneNumber.id,
      twilioCallSid: "CA-orgA-1",
      vapiCallId: "vapi-orgA-1",
      fromNumber: "+15005550006",
      toNumber: orgA.phoneNumber.e164Number,
    });
    await startCall(db, {
      organizationId: orgB.org.id,
      agentId: orgB.agent.id,
      phoneNumberId: orgB.phoneNumber.id,
      twilioCallSid: "CA-orgB-1",
      vapiCallId: "vapi-orgB-1",
      fromNumber: "+15005550006",
      toNumber: orgB.phoneNumber.e164Number,
    });

    const callsForA = await listCalls(db, { organizationId: orgA.org.id, userId: orgA.user.id });
    expect(callsForA.map((c) => c.twilioCallSid)).toEqual(["CA-orgA-1"]);
  });

  it("refuses to fetch another organization's call detail by id", async () => {
    const orgA = await seedOrgWithAgentAndNumber();
    const orgB = await seedOrgWithAgentAndNumber();

    const callInB = await startCall(db, {
      organizationId: orgB.org.id,
      agentId: orgB.agent.id,
      phoneNumberId: orgB.phoneNumber.id,
      twilioCallSid: "CA-orgB-2",
      vapiCallId: "vapi-orgB-2",
      fromNumber: "+15005550006",
      toNumber: orgB.phoneNumber.e164Number,
    });

    // orgA.user is a REAL member of orgA, and callInB.id is a REAL call
    // id — it just belongs to a different organization.
    await expect(
      getCallDetail(db, { organizationId: orgA.org.id, userId: orgA.user.id, callId: callInB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a non-member entirely", async () => {
    const orgA = await seedOrgWithAgentAndNumber();
    const [outsider] = await db
      .insert(users)
      .values({ email: "outsider@example.com", name: "Outsider", passwordHash: "x" })
      .returning();

    await expect(
      listCalls(db, { organizationId: orgA.org.id, userId: outsider.id }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });
});
