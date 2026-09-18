import { beforeAll, describe, expect, it } from "vitest";

// SESSION_SECRET must exist before lib/session.ts is imported, since it's
// read at call time inside the module — set it up front for this file.
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-production";
});

describe("session tokens", () => {
  it("round-trips a payload through encrypt/decrypt", async () => {
    const { encryptSession, decryptSession } = await import("@/lib/session");
    const token = await encryptSession({
      userId: "user-1",
      activeOrganizationId: "org-1",
    });

    const payload = await decryptSession(token);
    expect(payload).toMatchObject({ userId: "user-1", activeOrganizationId: "org-1" });
  });

  it("rejects a tampered token", async () => {
    const { encryptSession, decryptSession } = await import("@/lib/session");
    const token = await encryptSession({
      userId: "user-1",
      activeOrganizationId: "org-1",
    });

    const tampered = `${token.slice(0, -4)}abcd`;
    const payload = await decryptSession(tampered);
    expect(payload).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { encryptSession } = await import("@/lib/session");
    const token = await encryptSession({
      userId: "user-1",
      activeOrganizationId: "org-1",
    });

    process.env.SESSION_SECRET = "a-completely-different-secret";
    const { decryptSession } = await import("@/lib/session");
    const payload = await decryptSession(token);
    expect(payload).toBeNull();

    // restore for any later tests in this process
    process.env.SESSION_SECRET = "test-secret-do-not-use-in-production";
  });

  it("returns null for garbage input", async () => {
    const { decryptSession } = await import("@/lib/session");
    await expect(decryptSession("not-a-real-token")).resolves.toBeNull();
    await expect(decryptSession(undefined)).resolves.toBeNull();
  });
});
