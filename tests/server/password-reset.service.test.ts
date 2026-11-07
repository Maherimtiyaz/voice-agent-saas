import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import {
  authenticateUser,
  registerUser,
} from "@/server/services/auth.service";
import {
  requestPasswordReset,
  resetPassword,
} from "@/server/services/password-reset.service";
import { passwordResetTokens, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InvalidPasswordResetError } from "@/server/errors";

let db: TestDatabase;
let sentBody = "";

beforeEach(async () => {
  db = await createTestDatabase();
  sentBody = "";

  vi.stubEnv("EMAIL_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "SageLine <test@example.com>");
  vi.stubEnv("APP_URL", "https://example.com");

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      sentBody = body.text ?? "";
      return new Response(JSON.stringify({ id: "message-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function register(email: string) {
  return registerUser(db, {
    name: "Ada Lovelace",
    email,
    password: "correct-Horse1",
    organizationName: "Analytical Engines",
  });
}

function extractToken(body: string): string {
  const match = /\/reset-password\?token=([A-Za-z0-9_-]{43})/.exec(body);
  if (!match) throw new Error("reset link missing from email body");
  return match[1];
}

describe("password reset", () => {
  it("stores only a hash of the token and emails a working link", async () => {
    await register("reset1@example.com");

    await requestPasswordReset(db, { email: "reset1@example.com" });

    const token = extractToken(sentBody);
    const [row] = await db.select().from(passwordResetTokens);
    expect(row).toBeDefined();
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the password, revokes sessions, and burns the token", async () => {
    const registered = await register("reset2@example.com");
    await requestPasswordReset(db, { email: "reset2@example.com" });
    const token = extractToken(sentBody);

    await resetPassword(db, { token, password: "brand-New-Pass2" });

    await expect(
      authenticateUser(db, {
        email: "reset2@example.com",
        password: "correct-Horse1",
      }),
    ).rejects.toBeTruthy();

    const authenticated = await authenticateUser(db, {
      email: "reset2@example.com",
      password: "brand-New-Pass2",
    });
    expect(authenticated.user.sessionVersion).toBe(
      registered.user.sessionVersion + 1,
    );

    await expect(
      resetPassword(db, { token, password: "another-New-Pass3" }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetError);
  });

  it("silently does nothing for an unknown address", async () => {
    await requestPasswordReset(db, { email: "nobody@example.com" });
    const rows = await db.select().from(passwordResetTokens);
    expect(rows).toHaveLength(0);
  });

  it("does nothing when no email provider is configured", async () => {
    vi.stubEnv("EMAIL_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    await register("reset3@example.com");

    await requestPasswordReset(db, { email: "reset3@example.com" });

    const rows = await db.select().from(passwordResetTokens);
    expect(rows).toHaveLength(0);
  });

  it("invalidates an older link when a new one is requested", async () => {
    await register("reset4@example.com");

    await requestPasswordReset(db, { email: "reset4@example.com" });
    const firstToken = extractToken(sentBody);

    await requestPasswordReset(db, { email: "reset4@example.com" });
    const secondToken = extractToken(sentBody);
    expect(secondToken).not.toBe(firstToken);

    await expect(
      resetPassword(db, { token: firstToken, password: "new-password-1" }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetError);

    await resetPassword(db, { token: secondToken, password: "new-password-1" });
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, "reset4@example.com"));
    expect(user.passwordHash).not.toBe("new-password-1");
  });
});
