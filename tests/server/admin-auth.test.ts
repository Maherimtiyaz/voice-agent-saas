import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAdminAuthConfigured,
  verifyAdminCredentials,
} from "@/server/admin/auth";

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin basic auth", () => {
  it("is not configured when no credentials are set", () => {
    vi.stubEnv("ADMIN_USERNAME", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it("is configured when both credentials are set", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "s3cret");
    expect(isAdminAuthConfigured()).toBe(true);
  });

  it("returns null when no authorization header is present", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "s3cret");
    expect(verifyAdminCredentials(null)).toBeNull();
  });

  it("returns null for a non-Basic authorization scheme", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "s3cret");
    expect(verifyAdminCredentials("Bearer abc123")).toBeNull();
  });

  it("accepts the correct credentials", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "s3cret");
    expect(verifyAdminCredentials(basic("admin", "s3cret"))).toBe(true);
  });

  it("rejects a wrong password", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "s3cret");
    expect(verifyAdminCredentials(basic("admin", "wrong"))).toBe(false);
  });

  it("rejects a wrong username", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "s3cret");
    expect(verifyAdminCredentials(basic("someone", "s3cret"))).toBe(false);
  });

  it("rejects credentials that contain a colon in the password", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "pass:with:colons");
    expect(verifyAdminCredentials(basic("admin", "pass:with:colons"))).toBe(true);
    expect(verifyAdminCredentials(basic("admin", "pass"))).toBe(false);
  });

  it("returns null when credentials are not configured at all", () => {
    vi.stubEnv("ADMIN_USERNAME", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(verifyAdminCredentials(basic("admin", "s3cret"))).toBeNull();
  });
});
