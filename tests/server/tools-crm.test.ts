import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agents, appointments, calls, organizations, phoneNumbers } from "@/db/schema";
import { executeTool } from "@/server/tools/executor";
import { ensureToolsRegistered } from "@/server/tools/definitions";
import type { ToolContext } from "@/server/tools/types";

let db: TestDatabase;

async function seedOrgAgentAndCall(namePrefix: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${namePrefix} Inc`, slug: `${namePrefix.toLowerCase()}-${crypto.randomUUID()}` })
    .returning();
  const [agent] = await db
    .insert(agents)
    .values({ organizationId: org.id, name: `${namePrefix} Agent` })
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

async function seedOrgAndAgent() {
  const { org: orgA, agent: agentA, call: callA } = await seedOrgAgentAndCall("Acme");
  const { org: orgB, agent: agentB, call: callB } = await seedOrgAgentAndCall("Other");
  return { orgA, agentA, callA, orgB, agentB, callB };
}

function ctx(organizationId: string, agentId: string, callId: string): ToolContext {
  return { organizationId, agentId, callId };
}

beforeEach(async () => {
  db = await createTestDatabase();
  ensureToolsRegistered();
});

describe("get_customer / create_customer", () => {
  it("reports not found for a phone number that was never registered", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    const result = await executeTool(db, {
      toolName: "get_customer",
      rawInput: { phone: "+14155550100" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(result).toEqual({ success: true, data: { found: false } });
  });

  it("creates a customer, then finds it by phone", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    const created = await executeTool(db, {
      toolName: "create_customer",
      rawInput: { name: "Jane Doe", phone: "+14155550101" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(created.success).toBe(true);

    const found = await executeTool(db, {
      toolName: "get_customer",
      rawInput: { phone: "+14155550101" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(found.success).toBe(true);
    if (found.success) {
      expect(found.data).toMatchObject({ found: true, name: "Jane Doe" });
    }
  });

  it("returns the existing customer instead of erroring on a duplicate phone", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    await executeTool(db, {
      toolName: "create_customer",
      rawInput: { name: "Jane Doe", phone: "+14155550102" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    const second = await executeTool(db, {
      toolName: "create_customer",
      rawInput: { name: "Jane Doe Again", phone: "+14155550102" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });

    expect(second.success).toBe(true);
    if (second.success) {
      expect((second.data as { created: boolean }).created).toBe(false);
    }
  });

  it("keeps customers isolated per organization even with the same phone number", async () => {
    const { orgA, agentA, callA, orgB, agentB, callB } = await seedOrgAndAgent();
    await executeTool(db, {
      toolName: "create_customer",
      rawInput: { name: "Org A's customer", phone: "+14155550103" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });

    const foundInB = await executeTool(db, {
      toolName: "get_customer",
      rawInput: { phone: "+14155550103" },
      context: ctx(orgB.id, agentB.id, callB.id),
    });
    expect(foundInB).toEqual({ success: true, data: { found: false } });
  });

  it("rejects a malformed phone number before touching the database", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    const result = await executeTool(db, {
      toolName: "get_customer",
      rawInput: { phone: "not-a-phone-number" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(result.success).toBe(false);
  });
});

describe("check_availability / book_appointment", () => {
  it("offers slots within business hours on a day with no bookings", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    const result = await executeTool(db, {
      toolName: "check_availability",
      rawInput: { date: "2026-10-12" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { availableSlots: string[] };
      expect(data.availableSlots.length).toBeGreaterThan(0);
      expect(data.availableSlots[0]).toContain("2026-10-12");
    }
  });

  it("books an appointment and removes that slot from later availability", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    const booking = await executeTool(db, {
      toolName: "book_appointment",
      rawInput: {
        customerName: "Sam Rivera",
        customerPhone: "+14155550104",
        scheduledAt: "2026-10-13T15:00:00.000Z",
        durationMinutes: 30,
      },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(booking.success).toBe(true);
    if (booking.success) {
      expect((booking.data as { booked: boolean }).booked).toBe(true);
    }

    const availability = await executeTool(db, {
      toolName: "check_availability",
      rawInput: { date: "2026-10-13" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    if (availability.success) {
      const data = availability.data as { availableSlots: string[] };
      expect(data.availableSlots).not.toContain("2026-10-13T15:00:00.000Z");
    }
  });

  it("refuses to double-book the same slot", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    const params = {
      customerName: "Sam Rivera",
      customerPhone: "+14155550105",
      scheduledAt: "2026-10-14T10:00:00.000Z",
      durationMinutes: 30,
    };
    await executeTool(db, { toolName: "book_appointment", rawInput: params, context: ctx(orgA.id, agentA.id, callA.id) });
    const second = await executeTool(db, {
      toolName: "book_appointment",
      rawInput: { ...params, customerPhone: "+14155550106" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });

    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.data).toEqual({ booked: false, reason: "slot_unavailable" });
    }
  });

  it("keeps availability isolated per organization", async () => {
    const { orgA, agentA, callA, orgB, agentB, callB } = await seedOrgAndAgent();
    await executeTool(db, {
      toolName: "book_appointment",
      rawInput: {
        customerName: "Org A customer",
        customerPhone: "+14155550107",
        scheduledAt: "2026-10-15T09:00:00.000Z",
        durationMinutes: 30,
      },
      context: ctx(orgA.id, agentA.id, callA.id),
    });

    const availabilityForB = await executeTool(db, {
      toolName: "check_availability",
      rawInput: { date: "2026-10-15" },
      context: ctx(orgB.id, agentB.id, callB.id),
    });
    if (availabilityForB.success) {
      const data = availabilityForB.data as { availableSlots: string[] };
      expect(data.availableSlots).toContain("2026-10-15T09:00:00.000Z");
    }
  });
});

describe("create_job", () => {
  it("fails cleanly when the customer doesn't exist yet", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    const result = await executeTool(db, {
      toolName: "create_job",
      rawInput: { customerPhone: "+14155550199", description: "Fix the sink" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(result.success).toBe(false);
  });

  it("creates a job for an existing customer", async () => {
    const { orgA, agentA, callA } = await seedOrgAndAgent();
    await executeTool(db, {
      toolName: "create_customer",
      rawInput: { name: "Sam Rivera", phone: "+14155550108" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });

    const job = await executeTool(db, {
      toolName: "create_job",
      rawInput: { customerPhone: "+14155550108", description: "Replace water heater" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    expect(job.success).toBe(true);
    if (job.success) {
      expect((job.data as { status: string }).status).toBe("open");
    }
  });

  it("refuses to link a job to another organization's appointment", async () => {
    const { orgA, agentA, callA, orgB, agentB, callB } = await seedOrgAndAgent();
    await executeTool(db, {
      toolName: "create_customer",
      rawInput: { name: "Org A customer", phone: "+14155550109" },
      context: ctx(orgA.id, agentA.id, callA.id),
    });
    const bookingInB = await executeTool(db, {
      toolName: "book_appointment",
      rawInput: {
        customerName: "Org B customer",
        customerPhone: "+14155550110",
        scheduledAt: "2026-10-16T11:00:00.000Z",
      },
      context: ctx(orgB.id, agentB.id, callB.id),
    });
    expect(bookingInB.success).toBe(true);
    const appointmentIdInB = (bookingInB as { success: true; data: { appointmentId: string } }).data
      .appointmentId;

    const job = await executeTool(db, {
      toolName: "create_job",
      rawInput: {
        customerPhone: "+14155550109",
        description: "Should not link",
        appointmentId: appointmentIdInB,
      },
      context: ctx(orgA.id, agentA.id, callA.id),
    });

    expect(job.success).toBe(false);
  });
});

describe("tool JSON-schema generation", () => {
  it("builds a Vapi tools array covering every registered tool", async () => {
    const { buildVapiToolDefinitions } = await import("@/server/tools/registry");
    const definitions = buildVapiToolDefinitions();
    const names = definitions.map((d) => d.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_customer",
        "create_customer",
        "check_availability",
        "book_appointment",
        "create_job",
        "send_sms",
        "transfer_call",
      ]),
    );
  });
});

// Referenced so the appointments table import isn't flagged unused if a
// future edit trims a direct query above.
void appointments;
