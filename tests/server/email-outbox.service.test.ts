import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { emailOutbox, organizationInvites } from "@/db/schema";
import {
  drainEmailOutbox,
  listOrganizationEmails,
  queueEmail,
} from "@/server/services/email-outbox.service";
import { createOrganizationInvite } from "@/server/services/organization-invite.service";
import { organizationMembers, organizations, users } from "@/db/schema";

let db: TestDatabase;

async function seedWorkspace() {
  const [organization] = await db
    .insert(organizations)
    .values({ name: "Voice Workspace", slug: `voice-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@example.com`,
      name: "Workspace Owner",
      passwordHash: "test-hash",
    })
    .returning();
  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId: user.id,
    role: "owner",
  });
  return { organization, user };
}

beforeEach(async () => {
  db = await createTestDatabase();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("email outbox", () => {
  it("queues an email in the pending state", async () => {
    const { organization } = await seedWorkspace();

    const entry = await queueEmail(db, {
      organizationId: organization.id,
      to: "someone@example.com",
      subject: "Hello",
      body: "Body text",
    });

    expect(entry.status).toBe("pending");
    expect(entry.attempts).toBe(0);
    expect(entry.toEmail).toBe("someone@example.com");
    expect(entry.kind).toBe("organization_invite");
  });

  it("does nothing when no email provider is configured", async () => {
    const { organization } = await seedWorkspace();
    vi.stubEnv("EMAIL_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    await queueEmail(db, {
      organizationId: organization.id,
      to: "someone@example.com",
      subject: "Hello",
      body: "Body",
    });

    const result = await drainEmailOutbox(db);
    expect(result).toEqual({ sent: 0, failed: 0 });

    const rows = await db.select().from(emailOutbox);
    expect(rows[0].status).toBe("pending");
  });

  it("marks a queued email as sent after the provider accepts it", async () => {
    const { organization } = await seedWorkspace();
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Voice Agent <hello@example.com>");

    const fetchMock = vi.fn(async () =>
      Response.json({ id: "provider-message-1" }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await queueEmail(db, {
      organizationId: organization.id,
      to: "someone@example.com",
      subject: "Hello",
      body: "Body",
    });

    const result = await drainEmailOutbox(db);
    expect(result).toEqual({ sent: 1, failed: 0 });

    const [row] = await db.select().from(emailOutbox);
    expect(row.status).toBe("sent");
    expect(row.attempts).toBe(1);
    expect(row.sentAt).not.toBeNull();
    expect(row.lastError).toBeNull();

    // The provider received the address and body we queued.
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain("/emails");
    const payload = JSON.parse(String(call[1].body));
    expect(payload.to).toEqual(["someone@example.com"]);
    expect(payload.subject).toBe("Hello");
    expect(payload.text).toBe("Body");
  });

  it("keeps a failed email pending and records the error for retry", async () => {
    const { organization } = await seedWorkspace();
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Voice Agent <hello@example.com>");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("provider exploded", { status: 500 })),
    );

    await queueEmail(db, {
      organizationId: organization.id,
      to: "someone@example.com",
      subject: "Hello",
      body: "Body",
    });

    const result = await drainEmailOutbox(db);
    expect(result).toEqual({ sent: 0, failed: 1 });

    const [row] = await db.select().from(emailOutbox);
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("500");
  });

  it("parks an email as failed once it has exhausted its attempts", async () => {
    const { organization } = await seedWorkspace();
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Voice Agent <hello@example.com>");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    await queueEmail(db, {
      organizationId: organization.id,
      to: "someone@example.com",
      subject: "Hello",
      body: "Body",
    });

    // maxAttempts = 1, so the first failure is also the last.
    await drainEmailOutbox(db, { maxAttempts: 1 });

    const [row] = await db.select().from(emailOutbox);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
  });

  it("lists the emails queued for a workspace", async () => {
    const { organization } = await seedWorkspace();
    const other = await seedWorkspace();

    await queueEmail(db, {
      organizationId: organization.id,
      to: "a@example.com",
      subject: "One",
      body: "Body",
    });
    await queueEmail(db, {
      organizationId: other.organization.id,
      to: "b@example.com",
      subject: "Two",
      body: "Body",
    });

    const emails = await listOrganizationEmails(db, {
      organizationId: organization.id,
    });
    expect(emails).toHaveLength(1);
    expect(emails[0].toEmail).toBe("a@example.com");
  });
});

describe("organization invite email queueing", () => {
  it("queues the invitation email in the same transaction as the invite", async () => {
    const { organization, user } = await seedWorkspace();

    const created = await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: "teammate@example.com",
      role: "member",
      appUrl: "https://app.example.com",
    });

    const [invite] = await db
      .select()
      .from(organizationInvites)
      .where(eq(organizationInvites.id, created.inviteId));
    expect(invite).toBeDefined();

    const [email] = await db.select().from(emailOutbox);
    expect(email.toEmail).toBe("teammate@example.com");
    expect(email.body).toContain(`https://app.example.com/invite/${created.token}`);
    expect(email.organizationId).toBe(organization.id);
    expect(email.status).toBe("pending");
  });

  it("does not queue an email when no app url is supplied", async () => {
    const { organization, user } = await seedWorkspace();

    await createOrganizationInvite(db, {
      organizationId: organization.id,
      userId: user.id,
      email: "teammate@example.com",
      role: "member",
      appUrl: null,
    });

    const emails = await db.select().from(emailOutbox);
    expect(emails).toHaveLength(0);
  });

  it("rolls the email back when the invite itself fails", async () => {
    const { organization } = await seedWorkspace();
    // An ADMIN cannot grant admin access — that check runs before the
    // invite and its email are written, so nothing should be left
    // behind.
    const [admin] = await db
      .insert(users)
      .values({
        email: `${crypto.randomUUID()}@example.com`,
        name: "Workspace Admin",
        passwordHash: "test-hash",
      })
      .returning();
    await db.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: admin.id,
      role: "admin",
    });

    await expect(
      createOrganizationInvite(db, {
        organizationId: organization.id,
        userId: admin.id,
        email: "teammate@example.com",
        role: "admin",
        appUrl: "https://app.example.com",
      }),
    ).rejects.toThrow();

    const emails = await db.select().from(emailOutbox);
    expect(emails).toHaveLength(0);
  });
});
