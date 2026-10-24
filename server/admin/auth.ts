import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * HTTP Basic auth for the platform-admin surfaces (currently: the
 * landing-page lead inbox).
 *
 * The leads are GLOBAL data — they are not part of any workspace, so
 * they cannot be protected by the workspace membership model the rest
 * of the app uses. Rather than build a whole separate admin
 * authentication system for one page, this uses HTTP Basic auth
 * against a configured username and password.
 *
 * If `ADMIN_USERNAME` / `ADMIN_PASSWORD` are not configured, the
 * surface is disabled entirely (see `isAdminAuthConfigured`).
 */

function safeCompare(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  // timingSafeEqual throws if the buffers have different lengths, so
  // compare the lengths first and hash both sides to a fixed length
  // so the comparison itself is constant-time.
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  return timingSafeEqual(aBytes, bBytes);
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_USERNAME?.trim() &&
      process.env.ADMIN_PASSWORD?.trim(),
  );
}

/**
 * Checks an `Authorization: Basic ...` header.
 *
 * Returns `null` when the header is absent or malformed, and `false`
 * when it is present but wrong — the caller distinguishes "no
 * credentials" (401 with a challenge) from "wrong credentials"
 * (401 without leaking which was wrong).
 */
export function verifyAdminCredentials(
  authorization: string | null,
): boolean | null {
  if (!authorization) return null;
  const match = authorization.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return null;

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  const expectedUsername = process.env.ADMIN_USERNAME?.trim();
  const expectedPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!expectedUsername || !expectedPassword) return null;

  return (
    safeCompare(username, expectedUsername) &&
    safeCompare(password, expectedPassword)
  );
}
