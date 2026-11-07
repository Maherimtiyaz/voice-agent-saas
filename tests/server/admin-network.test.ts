import { afterEach, describe, expect, it } from "vitest";
import {
  adminAllowedIps,
  isIpAllowed,
} from "@/server/admin/network";

afterEach(() => {
  delete process.env.ADMIN_ALLOWED_IPS;
});

describe("admin IP allowlist", () => {
  it("matches an exact IPv4 address", () => {
    expect(isIpAllowed("203.0.113.10", ["203.0.113.10"])).toBe(true);
    expect(isIpAllowed("203.0.113.11", ["203.0.113.10"])).toBe(false);
  });

  it("matches an IPv4 CIDR range", () => {
    expect(isIpAllowed("203.0.113.200", ["203.0.113.0/24"])).toBe(true);
    expect(isIpAllowed("203.0.114.1", ["203.0.113.0/24"])).toBe(false);
  });

  it("handles the /0 and /32 boundaries", () => {
    expect(isIpAllowed("8.8.8.8", ["0.0.0.0/0"])).toBe(true);
    expect(isIpAllowed("8.8.8.8", ["8.8.8.8/32"])).toBe(true);
    expect(isIpAllowed("8.8.8.9", ["8.8.8.8/32"])).toBe(false);
  });

  it("matches an exact IPv6 address", () => {
    expect(isIpAllowed("2001:DB8::1", ["2001:db8::1"])).toBe(true);
    expect(isIpAllowed("2001:db8::2", ["2001:db8::1"])).toBe(false);
  });

  it("fails closed for an unknown or empty address", () => {
    expect(isIpAllowed("unknown", ["203.0.113.10"])).toBe(false);
    expect(isIpAllowed("", ["203.0.113.10"])).toBe(false);
  });

  it("ignores malformed entries instead of matching everything", () => {
    expect(isIpAllowed("203.0.113.10", ["not-an-ip", "999.1.1.1"])).toBe(false);
  });

  it("parses the comma-separated environment variable", () => {
    process.env.ADMIN_ALLOWED_IPS = " 203.0.113.10 , 198.51.100.0/24 , ";
    expect(adminAllowedIps()).toEqual(["203.0.113.10", "198.51.100.0/24"]);
  });

  it("returns an empty list when unset", () => {
    delete process.env.ADMIN_ALLOWED_IPS;
    expect(adminAllowedIps()).toEqual([]);
  });
});
