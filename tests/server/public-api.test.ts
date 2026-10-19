import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import {
  agents,
  apiKeys,
  callTranscripts,
  calls,
  organizationMembers,
  organizations,
  phoneNumbers,
  users,
} from "@/db/schema";
import {
  authenticateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/server/services/api-key.service";
import {
  getPublicCallDetail,
  listPublicAgents,
  listPublicCalls,
  listPublicPhoneNumbers,
} from "@/server/services/public-api.service";
import { InsufficientRoleError } from "@/server/errors";
import {
  apiError,
  apiSuccess,
  authorizePublicApiRequest,
  parsePagination,
} from "@/server/public-api/http";

let db: TestDatabase;

async function seedWorkspace(role: "owner" | "admin" | "member" = "owner") {
  const [organization] = await db
    .insert(organizations)
    .values({ name: "Workspace", slug: `workspace-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@example.com`,
      name: "User",
      passwordHash: "x",
    })
    .returning();
  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId: user.id,
    role,
  });
  return { organization, user };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("workspace API keys", () => {
  it("stores only a hash, authenticates bearer keys, and revokes them", async () => {
    const { organization, user } = await seedWorkspace();
    const created = await createApiKey(db, {
      organizationId: organization.id,
      userId: user.id,
      name: "Integration",
    });

    expect(created.token).toMatch(/^va_live_[A-Za-z0-9_-]{43}$/);
    expect(created.key.keyPrefix).toBe(created.token.slice(0, 16));

    const [stored] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, created.key.id));
    expect(stored.keyHash).not.toBe(created.token);
    expect(stored.keyHash).toHaveLength(64);

    await expect(
      authenticateApiKey(db, `Bearer ${created.token}`),
    ).resolves.toEqual({ id: created.key.id, organizationId: organization.id });
    const managedKeys = await listApiKeys(db, {
      organizationId: organization.id,
      userId: user.id,
    });
    expect(managedKeys).toHaveLength(1);
    expect(managedKeys[0]).not.toHaveProperty("keyHash");
    expect(managedKeys[0]).not.toHaveProperty("token");
    await expect(authenticateApiKey(db, `Bearer ${created.token}x`)).resolves.toBeNull();
    await expect(authenticateApiKey(db, null)).resolves.toBeNull();

    await revokeApiKey(db, {
      organizationId: organization.id,
      userId: user.id,
      apiKeyId: created.key.id,
    });
    await expect(
      authenticateApiKey(db, `Bearer ${created.token}`),
    ).resolves.toBeNull();
  });

  it("requires bearer authentication and sends no-store JSON errors", async () => {
    const response = apiError("Unauthorized.", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: { message: "Unauthorized." },
    });

    const unauthorized = await authorizePublicApiRequest(
      db,
      new Request("https://example.test/api/v1/agents"),
    );
    expect(unauthorized.identity).toBeUndefined();
    expect(unauthorized.error?.status).toBe(401);

    const { organization, user } = await seedWorkspace();
    const created = await createApiKey(db, {
      organizationId: organization.id,
      userId: user.id,
      name: "Read-only integration",
    });
    const authorized = await authorizePublicApiRequest(
      db,
      new Request("https://example.test/api/v1/agents", {
        headers: { Authorization: `Bearer ${created.token}` },
      }),
    );
    expect(authorized.identity).toEqual({
      id: created.key.id,
      organizationId: organization.id,
    });

    const success = apiSuccess([{ id: "item-1" }]);
    expect(success.headers.get("cache-control")).toBe("no-store");
    await expect(success.json()).resolves.toEqual({ data: [{ id: "item-1" }] });
  });

  it("requires workspace owners or admins to manage keys", async () => {
    const { organization, user } = await seedWorkspace("member");
    await expect(
      createApiKey(db, {
        organizationId: organization.id,
        userId: user.id,
        name: "Not allowed",
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleError);
  });
});

describe("public API read DTOs", () => {
  it("returns only the key's workspace data and excludes provider secrets", async () => {
    const workspaceA = await seedWorkspace();
    const workspaceB = await seedWorkspace();
    const [agentA] = await db
      .insert(agents)
      .values({
        organizationId: workspaceA.organization.id,
        name: "Public agent",
        systemPrompt: "Do not expose this prompt.",
        vapiAssistantId: "private-assistant-id",
      })
      .returning();
    const [agentB] = await db
      .insert(agents)
      .values({ organizationId: workspaceB.organization.id, name: "Other workspace" })
      .returning();
    const [phoneNumberA] = await db
      .insert(phoneNumbers)
      .values({
        organizationId: workspaceA.organization.id,
        agentId: agentA.id,
        twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
        e164Number: "+14155550100",
        vapiPhoneNumberId: "private-phone-id",
      })
      .returning();
    await db.insert(phoneNumbers).values({
      organizationId: workspaceB.organization.id,
      agentId: agentB.id,
      twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
      e164Number: "+14155550101",
    });
    const [call] = await db
      .insert(calls)
      .values({
        organizationId: workspaceA.organization.id,
        agentId: agentA.id,
        phoneNumberId: phoneNumberA.id,
        twilioCallSid: "private-twilio-sid",
        vapiCallId: "private-vapi-id",
        fromNumber: "+14155559999",
        toNumber: phoneNumberA.e164Number,
      })
      .returning();
    await db.insert(callTranscripts).values({
      callId: call.id,
      role: "user",
      content: "Hello",
      sequenceNumber: 1,
    });

    const listedAgents = await listPublicAgents(db, workspaceA.organization.id);
    const listedNumbers = await listPublicPhoneNumbers(db, workspaceA.organization.id);
    const callPage = await listPublicCalls(db, {
      organizationId: workspaceA.organization.id,
      limit: 1,
      offset: 0,
    });
    const detail = await getPublicCallDetail(db, {
      organizationId: workspaceA.organization.id,
      callId: call.id,
    });
    const crossTenantCall = await getPublicCallDetail(db, {
      organizationId: workspaceB.organization.id,
      callId: call.id,
    });

    expect(listedAgents).toHaveLength(1);
    expect(listedAgents[0]).not.toHaveProperty("systemPrompt");
    expect(listedAgents[0]).not.toHaveProperty("vapiAssistantId");
    expect(listedNumbers).toHaveLength(1);
    expect(listedNumbers[0]).not.toHaveProperty("twilioNumberSid");
    expect(listedNumbers[0]).not.toHaveProperty("vapiPhoneNumberId");
    expect(callPage.data).toHaveLength(1);
    expect(callPage.data[0].direction).toBe("inbound");
    expect(callPage.data[0]).not.toHaveProperty("twilioCallSid");
    expect(callPage.data[0]).not.toHaveProperty("vapiCallId");
    expect(detail?.transcripts[0].content).toBe("Hello");
    expect(crossTenantCall).toBeNull();
  });

  it("paginates calls and only returns hasMore when another row exists", async () => {
    const { organization } = await seedWorkspace();
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: organization.id, name: "Agent" })
      .returning();
    const [phoneNumber] = await db
      .insert(phoneNumbers)
      .values({
        organizationId: organization.id,
        twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
        e164Number: "+14155550102",
      })
      .returning();
    await db.insert(calls).values([
      {
        organizationId: organization.id,
        agentId: agent.id,
        phoneNumberId: phoneNumber.id,
        twilioCallSid: "call-1",
        fromNumber: "+14155559991",
        toNumber: phoneNumber.e164Number,
      },
      {
        organizationId: organization.id,
        agentId: agent.id,
        phoneNumberId: phoneNumber.id,
        twilioCallSid: "call-2",
        fromNumber: "+14155559992",
        toNumber: phoneNumber.e164Number,
      },
    ]);

    const page = await listPublicCalls(db, {
      organizationId: organization.id,
      limit: 1,
      offset: 0,
    });
    expect(page.data).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });

  it("validates call-list pagination input", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({
      ok: true,
      limit: 50,
      offset: 0,
    });
    expect(parsePagination(new URLSearchParams("limit=100&offset=12"))).toEqual({
      ok: true,
      limit: 100,
      offset: 12,
    });
    expect(parsePagination(new URLSearchParams("limit=101")).ok).toBe(false);
    expect(parsePagination(new URLSearchParams("offset=-1")).ok).toBe(false);
    expect(parsePagination(new URLSearchParams("limit=1.5")).ok).toBe(false);
  });
});
