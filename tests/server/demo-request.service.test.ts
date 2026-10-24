import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { demoRequests } from "@/db/schema";
import {
  countDemoRequests,
  createDemoRequest,
  listDemoRequests,
  updateDemoRequestStatus,
} from "@/server/services/demo-request.service";
import { ConflictError } from "@/server/errors";

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("demo requests", () => {
  it("stores a lead and normalizes the email address", async () => {
    const created = await createDemoRequest(db, {
      name: "  Jordan Reyes  ",
      email: "  Jordan@Example.COM ",
      company: "  Acme Plumbing ",
      useCase: "Book service visits",
      callVolume: "10_50",
    });

    expect(created.name).toBe("Jordan Reyes");
    expect(created.email).toBe("jordan@example.com");
    expect(created.company).toBe("Acme Plumbing");
    expect(created.status).toBe("new");
  });

  it("stores missing optional fields as null rather than empty strings", async () => {
    const created = await createDemoRequest(db, {
      name: "Sam Lee",
      email: "sam@example.com",
      company: "",
      phone: "",
      useCase: "",
      message: "",
    });

    expect(created.company).toBeNull();
    expect(created.phone).toBeNull();
    expect(created.useCase).toBeNull();
    expect(created.message).toBeNull();
  });

  it("updates the existing lead when the same email submits again", async () => {
    const first = await createDemoRequest(db, {
      name: "Jordan Reyes",
      email: "jordan@example.com",
      company: "Acme Plumbing",
    });

    const second = await createDemoRequest(db, {
      name: "Jordan Reyes",
      email: "jordan@example.com",
      company: "Acme Plumbing & Heating",
      message: "Also interested in a demo next week",
    });

    expect(second.id).toBe(first.id);
    expect(second.company).toBe("Acme Plumbing & Heating");
    expect(second.message).toBe("Also interested in a demo next week");

    // Still exactly one row — the form must not create duplicates.
    const rows = await db.select().from(demoRequests);
    expect(rows).toHaveLength(1);
  });

  it("lists leads newest first and can filter by status", async () => {
    const first = await createDemoRequest(db, {
      name: "First",
      email: "first@example.com",
    });
    await createDemoRequest(db, {
      name: "Second",
      email: "second@example.com",
    });

    const all = await listDemoRequests(db);
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("Second");

    await updateDemoRequestStatus(db, { id: first.id, status: "contacted" });

    const contacted = await listDemoRequests(db, { status: "contacted" });
    expect(contacted).toHaveLength(1);
    expect(contacted[0].name).toBe("First");

    const newOnes = await listDemoRequests(db, { status: "new" });
    expect(newOnes).toHaveLength(1);
    expect(newOnes[0].name).toBe("Second");
  });

  it("counts leads, optionally by status", async () => {
    await createDemoRequest(db, { name: "A", email: "a@example.com" });
    await createDemoRequest(db, { name: "B", email: "b@example.com" });

    expect(await countDemoRequests(db)).toBe(2);
    expect(await countDemoRequests(db, { status: "new" })).toBe(2);
    expect(await countDemoRequests(db, { status: "closed" })).toBe(0);
  });

  it("rejects updating a lead that no longer exists", async () => {
    await expect(
      updateDemoRequestStatus(db, {
        id: "00000000-0000-0000-0000-000000000000",
        status: "contacted",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not attach the lead to any workspace", async () => {
    // A lead is a stranger, not a tenant member. The table has no
    // organization column at all, which is the guarantee.
    const created = await createDemoRequest(db, {
      name: "Jordan Reyes",
      email: "jordan@example.com",
    });

    const [stored] = await db
      .select()
      .from(demoRequests)
      .where(eq(demoRequests.id, created.id));

    expect(stored).toBeDefined();
    expect(Object.keys(stored)).not.toContain("organizationId");
    expect(Object.keys(stored)).not.toContain("userId");
  });
});
