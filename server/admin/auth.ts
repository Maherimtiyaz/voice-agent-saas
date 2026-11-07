import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

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
 * surface is disabled entirely (see `isAdminAuthConfigured`). A password
 * shorter than `ADMIN_PASSWORD_MIN_LENGTH` also disables it: Basic auth has
 * no lockout of its own, so a weak shared password is a brute-force target
 * even with the per-IP rate limit the route applies.
 */

export const ADMIN_PASSWORD_MIN_LENGTH = 24;

function safeCompare(a: string, b: string): boolean {
  // Hash both sides to a fixed-length digest before comparing. Passing
  // the raw buffers would force a length check first, and an early
  // return on length leaks how long the configured credential is.
  const aDigest = createHash("sha256").update(a, "utf8").digest();
  const bDigest = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(aDigest, bDigest);
}

export function isAdminAuthConfigured(): boolean {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  return Boolean(
    username &&
      password &&
      password.length >= ADMIN_PASSWORD_MIN_LENGTH,
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
  if (
    !expectedUsername ||
    !expectedPassword ||
    expectedPassword.length < ADMIN_PASSWORD_MIN_LENGTH
  ) {
    return null;
  }

  return (
    safeCompare(username, expectedUsername) &&
    safeCompare(password, expectedPassword)
  );
}
