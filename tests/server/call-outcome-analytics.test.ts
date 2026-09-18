import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agents, calls, organizationMembers, organizations, phoneNumbers, users } from "@/db/schema";
import { executeTool } from "@/server/tools/executor";
import { ensureToolsRegistered } from "@/server/tools/definitions";
import { getCallSummary, getToolUsageSummary } from "@/server/services/analytics.service";
import type { ToolContext } from "@/server/tools/types";

let db: TestDatabase;

async function seedOrgAgentAndCall() {
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
  const [call] = await db
    .insert(calls)
    .values({
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: `CA${crypto.randomUUID().replace(/-/g, "").slice(0, 30)}`,
      fromNumber: "+15005550006",
      toNumber: phoneNumber.e164Number,
      status: "completed",
      durationSeconds: 90,
    })
    .returning();
  return { org, user, agent, call };
}

function ctx(organizationId: string, agentId: string, callId: string): ToolContext {
  return { organizationId, agentId, callId };
}

beforeEach(async () => {
  db = await createTestDatabase();
  ensureToolsRegistered();
});

describe("call outcome", () => {
  it("sets appointment_booked on the call after a successful booking", async () => {
    const { org, user, agent, call } = await seedOrgAgentAndCall();
    await executeTool(db, {
      toolName: "book_appointment",
      rawInput: {
        customerName: "Sam Rivera",
        customerPhone: "+14155550200",
        scheduledAt: "2026-11-02T10:00:00.000Z",
      },
      context: ctx(org.id, agent.id, call.id),
    });

    const [row] = await db.select().from(calls).where(eq(calls.id, call.id));
    expect(row.outcome).toBe("appointment_booked");
  });

  it("does NOT overwrite outcome when a later booking attempt fails (slot unavailable)", async () => {
    const { org, user, agent, call } = await seedOrgAgentAndCall();
    const params = {
      customerName: "Sam Rivera",
      customerPhone: "+14155550201",
      scheduledAt: "2026-11-03T10:00:00.000Z",
    };
    await executeTool(db, {
      toolName: "book_appointment",
      rawInput: params,
      context: ctx(org.id, agent.id, call.id),
    });
    const second = await executeTool(db, {
      toolName: "book_appointment",
      rawInput: { ...params, customerPhone: "+14155550202" },
      context: ctx(org.id, agent.id, call.id),
    });

    expect(second.success).toBe(true);
    const [row] = await db.select().from(calls).where(eq(calls.id, call.id));
    // The FIRST call's outcome (appointment_booked) must not be
    // overwritten by a second attempt that didn't actually book anything.
    expect(row.outcome).toBe("appointment_booked");
  });

  it("does not set an outcome for get_customer (a read has no business outcome)", async () => {
    const { org, user, agent, call } = await seedOrgAgentAndCall();
    await executeTool(db, {
      toolName: "get_customer",
      rawInput: { phone: "+14155550203" },
      context: ctx(org.id, agent.id, call.id),
    });

    const [row] = await db.select().from(calls).where(eq(calls.id, call.id));
    expect(row.outcome).toBeNull();
  });

  it("the latest outcome-bearing tool call wins", async () => {
    const { org, user, agent, call } = await seedOrgAgentAndCall();
    await executeTool(db, {
      toolName: "create_customer",
      rawInput: { name: "Sam Rivera", phone: "+14155550204" },
      context: ctx(org.id, agent.id, call.id),
    });
    await executeTool(db, {
      toolName: "book_appointment",
      rawInput: {
        customerName: "Sam Rivera",
        customerPhone: "+14155550204",
        scheduledAt: "2026-11-04T10:00:00.000Z",
      },
      context: ctx(org.id, agent.id, call.id),
    });
    await executeTool(db, {
      toolName: "create_job",
      rawInput: { customerPhone: "+14155550204", description: "Install new unit" },
      context: ctx(org.id, agent.id, call.id),
    });

    const [row] = await db.select().from(calls).where(eq(calls.id, call.id));
    expect(row.outcome).toBe("job_created");
  });
});

describe("analytics", () => {
  it("summarizes call status, outcome, duration, and daily volume", async () => {
    const { org, user, agent, call } = await seedOrgAgentAndCall();
    await executeTool(db, {
      toolName: "book_appointment",
      rawInput: {
        customerName: "Sam Rivera",
        customerPhone: "+14155550205",
        scheduledAt: "2026-11-05T10:00:00.000Z",
      },
      context: ctx(org.id, agent.id, call.id),
    });

    const summary = await getCallSummary(db, { organizationId: org.id, userId: user.id });
    expect(summary.totalCalls).toBe(1);
    expect(summary.byStatus.completed).toBe(1);
    expect(summary.byOutcome.appointment_booked).toBe(1);
    expect(summary.averageDurationSeconds).toBe(90);
    expect(summary.dailyVolume).toHaveLength(14);
    expect(summary.dailyVolume.reduce((sum, d) => sum + d.count, 0)).toBe(1);
  });

  it("isolates call summaries per organization", async () => {
    const orgA = await seedOrgAgentAndCall();
    await seedOrgAgentAndCall();

    const summary = await getCallSummary(db, {
      organizationId: orgA.org.id,
      userId: orgA.user.id,
    });
    expect(summary.totalCalls).toBe(1);
  });

  it("summarizes tool usage by success/failure", async () => {
    const { org, user, agent, call } = await seedOrgAgentAndCall();
    await executeTool(db, {
      toolName: "get_customer",
      rawInput: { phone: "+14155550206" },
      context: ctx(org.id, agent.id, call.id),
    });
    await executeTool(db, {
      toolName: "get_customer",
      rawInput: { phone: "not-valid" },
      context: ctx(org.id, agent.id, call.id),
    });

    const usage = await getToolUsageSummary(db, { organizationId: org.id, userId: user.id });
    const getCustomer = usage.find((u) => u.toolName === "get_customer");
    expect(getCustomer).toEqual({ toolName: "get_customer", successCount: 1, failureCount: 1 });
  });
});
