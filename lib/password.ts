import "server-only";
import bcrypt from "bcryptjs";

// 12 rounds is a reasonable balance of cost vs. login latency in 2026;
// revisit upward as hardware gets cheaper.
const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
