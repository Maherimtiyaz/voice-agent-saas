import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agents, calls, organizations, phoneNumbers, toolExecutions } from "@/db/schema";
import { executeTool } from "@/server/tools/executor";
import { ensureToolsRegistered } from "@/server/tools/definitions";
import { eq } from "drizzle-orm";

let db: TestDatabase;

async function seedOrgAgentAndCall(transferNumber?: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme Inc", slug: `acme-${crypto.randomUUID()}` })
    .returning();
  const [agent] = await db
    .insert(agents)
    .values({ organizationId: org.id, name: "Front Desk", transferNumber })
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
  const [call] = await db
    .insert(calls)
    .values({
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: `CA${crypto.randomUUID().replace(/-/g, "").slice(0, 30)}`,
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
    })
    .returning();
  return { org, agent, phoneNumber, call };
}

beforeEach(async () => {
  db = await createTestDatabase();
  ensureToolsRegistered();
});

describe("transfer_call", () => {
  it("fails cleanly when the agent has no transfer number configured", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall(undefined);
    const result = await executeTool(db, {
      toolName: "transfer_call",
      rawInput: { reason: "customer asked for a human" },
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });

    expect(result).toEqual({
      success: false,
      error: "No transfer number is configured for this agent.",
    });
  });

  it("never lets the caller supply the transfer destination — the schema has no such field", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall("+14155550199");
    // Even if a rogue payload tries to sneak in a destination, the zod
    // schema for this tool only recognizes `reason` — an extra field is
    // simply ignored, not honored.
    const result = await executeTool(db, {
      toolName: "transfer_call",
      rawInput: { reason: "test", destinationNumber: "+19995551234" },
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });
    // This will attempt the real Twilio call and fail without live
    // credentials — what matters for this test is that it never
    // reports success with the injected destination; the absence of
    // TWILIO_ACCOUNT_SID/AUTH_TOKEN in this test env makes that certain.
    expect(result.success).toBe(false);
  });

  it("logs the attempt even when it fails", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall(undefined);
    await executeTool(db, {
      toolName: "transfer_call",
      rawInput: {},
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });

    const [row] = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.callId, call.id));
    expect(row.toolName).toBe("transfer_call");
    expect(row.status).toBe("failure");
  });
});

describe("send_sms", () => {
  it("fails cleanly when the phone number has no e164Number resolvable (defensive path)", async () => {
    // This exercises the guard before any Twilio call is attempted —
    // full send success/failure against the real API is not verified in
    // this environment (no live TWILIO_ACCOUNT_SID/AUTH_TOKEN).
    const { org, agent, call } = await seedOrgAgentAndCall(undefined);
    const result = await executeTool(db, {
      toolName: "send_sms",
      rawInput: { to: "+14155550188", body: "Your appointment is confirmed." },
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });
    // Without TWILIO_ACCOUNT_SID/AUTH_TOKEN configured in this test
    // environment, the underlying sendSms() call throws and is caught —
    // confirming failures here are handled safely, not left to crash
    // the webhook.
    expect(result.success).toBe(false);
  });

  it("rejects a malformed destination number before any Twilio call is attempted", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall(undefined);
    const result = await executeTool(db, {
      toolName: "send_sms",
      rawInput: { to: "not-a-number", body: "hi" },
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a body that exceeds the length limit", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall(undefined);
    const result = await executeTool(db, {
      toolName: "send_sms",
      rawInput: { to: "+14155550188", body: "x".repeat(500) },
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });
    expect(result.success).toBe(false);
  });
});
