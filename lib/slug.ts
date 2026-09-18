/**
 * Turns a display name into a URL-safe slug, with a short random suffix
 * to make collisions unlikely without a DB round-trip. Good enough for
 * Phase 1; a real "claim your subdomain" flow can replace this later.
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "workspace"}-${suffix}`;
}
