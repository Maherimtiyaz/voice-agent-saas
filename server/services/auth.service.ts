import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { organizationMembers, organizations, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { slugify } from "@/lib/slug";
import { EmailTakenError, InvalidCredentialsError } from "@/server/errors";
import type { LoginInput, RegisterInput } from "@/server/validation/auth";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface RegisterResult {
  user: AuthenticatedUser;
  organizationId: string;
}

/**
 * Creates a brand-new user AND their first organization together, in a
 * single transaction, with the user set as `owner`. There's no
 * "join an existing organization" flow yet (that needs invites, which
 * are out of scope for Phase 1) — every registration starts a new
 * workspace.
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
      .returning({ id: users.id, email: users.email, name: users.name });

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
    })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  return { user: { id: user.id, email: user.email, name: user.name } };
}
