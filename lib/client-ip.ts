/**
 * The best-effort client IP, used as a secondary rate-limit key and for
 * admin audit logs. Never used as an authorization decision on its own.
 *
 * `x-forwarded-for` is a chain: proxies append to it. The FIRST entry is
 * whatever the client claimed, so it is attacker-controlled; the LAST entry
 * is the one the platform in front of us added. Vercel also exposes
 * `x-real-ip`, which is simpler but not present on every host, so prefer
 * the forwarded chain and fall back to it.
 *
 * If neither header exists (local dev, a non-proxy deployment), callers
 * share the key `"unknown"`. That is intentional: it degrades rate limiting
 * to a global limit rather than letting each request invent a key.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return headers.get("x-real-ip")?.trim() || "unknown";
}
