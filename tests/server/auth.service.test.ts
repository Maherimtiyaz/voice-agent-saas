import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { authenticateUser, registerUser } from "@/server/services/auth.service";
import { EmailTakenError, InvalidCredentialsError } from "@/server/errors";
import { organizationMembers, users } from "@/db/schema";
import { eq } from "drizzle-orm";

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("auth service", () => {
  it("registers a new user with their own organization as owner", async () => {
    const result = await registerUser(db, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct-Horse1",
      organizationName: "Analytical Engines",
    });

    expect(result.user.email).toBe("ada@example.com");

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, result.user.id));
    expect(membership.role).toBe("owner");
    expect(membership.organizationId).toBe(result.organizationId);
  });

  it("never stores the plaintext password", async () => {
    const result = await registerUser(db, {
      name: "Ada Lovelace",
      email: "ada2@example.com",
      password: "correct-Horse1",
      organizationName: "Analytical Engines",
    });

    const [row] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(row.passwordHash).not.toBe("correct-Horse1");
    expect(row.passwordHash.length).toBeGreaterThan(20);
  });

  it("rejects registration with an email that's already taken", async () => {
    await registerUser(db, {
      name: "First",
      email: "dup@example.com",
      password: "correct-Horse1",
      organizationName: "First Org",
    });

    await expect(
      registerUser(db, {
        name: "Second",
        email: "dup@example.com",
        password: "another-Pass1",
        organizationName: "Second Org",
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("authenticates with the correct password", async () => {
    await registerUser(db, {
      name: "Ada Lovelace",
      email: "ada3@example.com",
      password: "correct-Horse1",
      organizationName: "Analytical Engines",
    });

    const result = await authenticateUser(db, {
      email: "ada3@example.com",
      password: "correct-Horse1",
    });
    expect(result.user.email).toBe("ada3@example.com");
  });

  it("rejects an incorrect password", async () => {
    await registerUser(db, {
      name: "Ada Lovelace",
      email: "ada4@example.com",
      password: "correct-Horse1",
      organizationName: "Analytical Engines",
    });

    await expect(
      authenticateUser(db, { email: "ada4@example.com", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects an email that was never registered, with the same error as a wrong password", async () => {
    await expect(
      authenticateUser(db, { email: "nobody@example.com", password: "whatever-1" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
