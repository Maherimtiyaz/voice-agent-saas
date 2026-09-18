import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("hashes a password to something other than the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies the correct password against its hash", async () => {
    const hash = await hashPassword("s3cure-Pass1");
    await expect(verifyPassword("s3cure-Pass1", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("s3cure-Pass1");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const first = await hashPassword("same-input");
    const second = await hashPassword("same-input");
    expect(first).not.toBe(second);
  });
});
