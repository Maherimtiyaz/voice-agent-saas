import "server-only";

/**
 * Optional IP allowlist for the platform-admin surface.
 *
 * `ADMIN_ALLOWED_IPS` is a comma-separated list of exact addresses or IPv4
 * CIDR ranges, e.g.:
 *
 *   ADMIN_ALLOWED_IPS=203.0.113.10,198.51.100.0/24,2001:db8::1
 *
 * `getClientIp` already resolves the platform-added forwarding hop. When an
 * allowlist is configured, an address that cannot be parsed or is missing
 * fails closed (404) rather than open.
 */

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(value: string): number | null {
  const match = IPV4_PATTERN.exec(value);
  if (!match) return null;

  let result = 0;
  for (let index = 1; index <= 4; index++) {
    const octet = Number(match[index]);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }
  // `>>> 0` keeps the arithmetic unsigned; JS bitwise operators produce a
  // signed 32-bit value otherwise.
  return result >>> 0;
}

function matchesIpv4Cidr(ip: string, entry: string): boolean {
  const [network, prefixRaw] = entry.split("/");
  if (prefixRaw === undefined) return false;

  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const address = parseIpv4(ip);
  const base = parseIpv4(network);
  if (address === null || base === null) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

/** Normalizes an IPv6 literal for exact comparison. */
function normalizeIpv6(value: string): string {
  return value.trim().toLowerCase();
}

export function isIpAllowed(ip: string, allowed: readonly string[]): boolean {
  const candidate = ip.trim();
  if (!candidate || candidate === "unknown") return false;

  for (const rawEntry of allowed) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    if (entry.includes("/")) {
      if (matchesIpv4Cidr(candidate, entry)) return true;
      continue;
    }

    if (parseIpv4(candidate) !== null && parseIpv4(entry) !== null) {
      if (parseIpv4(candidate) === parseIpv4(entry)) return true;
      continue;
    }

    // IPv6 (and anything else) is compared verbatim; CIDR support for IPv6
    // is intentionally out of scope until it is needed.
    if (normalizeIpv6(candidate) === normalizeIpv6(entry)) return true;
  }

  return false;
}

export function adminAllowedIps(): string[] {
  return (process.env.ADMIN_ALLOWED_IPS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
