/**
 * Postgres unique_violation (SQLSTATE 23505). Drizzle wraps the driver
 * error in its own Error (message "Failed query: ...") with the
 * original driver error attached as `.cause` — postgres-js and pglite
 * don't wrap identically, so this checks both the top-level and the
 * `.cause` shape rather than assuming one.
 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === "23505") return true;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return causeCode === "23505";
}
