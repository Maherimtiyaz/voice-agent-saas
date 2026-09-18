import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agents, calls, organizations, phoneNumbers, toolExecutions } from "@/db/schema";
import { executeTool } from "@/server/tools/executor";
import { registerTool } from "@/server/tools/registry";
import type { ToolDefinition } from "@/server/tools/types";
import { z } from "zod";

let db: TestDatabase;

async function seedOrgAgentAndCall() {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme Inc", slug: `acme-${crypto.randomUUID()}` })
    .returning();
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
    })
    .returning();
  return { org, agent, call };
}

const echoTool: ToolDefinition<{ text: string }> = {
  name: "test_echo",
  description: "Echoes the input back.",
  inputSchema: z.object({ text: z.string().min(1) }),
  async handler(_db, input) {
    return { success: true, data: { echoed: input.text } };
  },
};

const throwingTool: ToolDefinition<{ text: string }> = {
  name: "test_throw",
  description: "Always throws.",
  inputSchema: z.object({ text: z.string() }),
  async handler() {
    throw new Error("boom — internal detail that must not reach the caller");
  },
};

beforeEach(async () => {
  db = await createTestDatabase();
  registerTool(echoTool);
  registerTool(throwingTool);
});

describe("executeTool", () => {
  it("runs a registered tool and returns its structured result", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall();
    const result = await executeTool(db, {
      toolName: "test_echo",
      rawInput: { text: "hello" },
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });

    expect(result).toEqual({ success: true, data: { echoed: "hello" } });
  });

  it("rejects input that fails the tool's schema before the handler ever runs", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall();
    const result = await executeTool(db, {
      toolName: "test_echo",
      rawInput: { text: "" }, // violates .min(1)
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });

    expect(result.success).toBe(false);
  });

  it("returns a clean failure for an unknown tool name rather than throwing", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall();
    const result = await executeTool(db, {
      toolName: "not_a_real_tool",
      rawInput: {},
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });

    expect(result).toEqual({ success: false, error: 'Unknown tool "not_a_real_tool".' });
  });

  it("never leaks a handler's thrown error message to the caller", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall();
    const result = await executeTool(db, {
      toolName: "test_throw",
      rawInput: { text: "x" },
      context: { organizationId: org.id, agentId: agent.id, callId: call.id },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain("internal detail");
    }
  });

  it("logs every execution — success and failure — to tool_executions", async () => {
    const { org, agent, call } = await seedOrgAgentAndCall();
    const callId = call.id;

    await executeTool(db, {
      toolName: "test_echo",
      rawInput: { text: "logged" },
      context: { organizationId: org.id, agentId: agent.id, callId },
    });
    await executeTool(db, {
      toolName: "test_throw",
      rawInput: { text: "logged" },
      context: { organizationId: org.id, agentId: agent.id, callId },
    });

    const rows = await db
      .select()
      .from(toolExecutions)
      .where(and(eq(toolExecutions.organizationId, org.id), eq(toolExecutions.agentId, agent.id)));

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.toolName === "test_echo")?.status).toBe("success");
    expect(rows.find((r) => r.toolName === "test_throw")?.status).toBe("failure");
  });
});
