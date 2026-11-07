import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { organizationMembers, organizations, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { slugify } from "@/lib/slug";
import {
  EmailTakenError,
  InvalidCredentialsError,
  NotFoundError,
} from "@/server/errors";
import type { LoginInput, RegisterInput } from "@/server/validation/auth";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  /** Value to embed in the session token. */
  sessionVersion: number;
}

export interface RegisterResult {
  user: AuthenticatedUser;
  organizationId: string;
}

/**
 * Creates a brand-new user AND their first organization together, in a
 * single transaction, with the user set as `owner`. Invite-based
 * registration is handled separately by organization-invite.service.ts.
 */
export async function registerUser(
  db: Database,
  input: RegisterInput,
): Promise<RegisterResult> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw new EmailTakenError();
  }

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name: input.organizationName, slug: slugify(input.organizationName) })
      .returning({ id: organizations.id });

    const [user] = await tx
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        sessionVersion: users.sessionVersion,
      });

    await tx.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    });

    return { user, organizationId: organization.id };
  });
}

export interface AuthenticateResult {
  user: AuthenticatedUser;
}

/**
 * A bcrypt hash of a throwaway string, used only to keep the "no such
 * user" path as slow as the "wrong password" path.
 *
 * Without this, a request for an unregistered email returns as soon as
 * the SELECT comes back empty, while a registered email costs a full
 * bcrypt comparison — a timing difference large enough to enumerate
 * accounts despite the identical error message. Cost 12, matching
 * `lib/password.ts`.
 */
const TIMING_EQUALIZER_HASH =
  "$2b$12$Aer.0HRirKiCsHFRdbJif.waXtWjhlRsAP2HlhJYisw7J0IeMkkvO";

/**
 * Verifies email/password. Deliberately returns the SAME error for
 * "no such user" and "wrong password" so the response can't be used
 * to enumerate registered emails.
 */
export async function authenticateUser(
  db: Database,
  input: LoginInput,
): Promise<AuthenticateResult> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    await verifyPassword(input.password, TIMING_EQUALIZER_HASH);
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      sessionVersion: user.sessionVersion,
    },
  };
}

/**
 * Invalidates every session token issued to this user by advancing their
 * `session_version`. The caller's own cookie becomes invalid too, so
 * "sign out everywhere" is expected to be followed by deleting the cookie
 * and redirecting to login.
 *
 * Returns the new version, which is what a caller that wants to keep the
 * current browser signed in would put in a freshly issued token.
 */
export async function revokeUserSessions(
  db: Database,
  userId: string,
): Promise<number> {
  const [updated] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion });

  if (!updated) {
    throw new NotFoundError("User");
  }
  return updated.sessionVersion;
}
