import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { hashPassword } from "@/lib/password";
import { siteUrl } from "@/lib/site-url";
import { InvalidPasswordResetError } from "@/server/errors";
import { isEmailConfigured, sendEmail } from "@/server/integrations/email/client";

/**
 * Self-service password reset.
 *
 * Flow:
 *   1. `requestPasswordReset` records a single-use token (only its SHA-256
 *      hash is stored) and emails the raw token in a link.
 *   2. `resetPassword` verifies the token, writes the new bcrypt hash, and
 *      bumps `users.sessionVersion` — so every session issued before the
 *      reset is immediately invalid.
 *
 * Requesting a reset never reveals whether the email exists: the caller
 * always shows the same message, and the service simply does nothing for an
 * unknown address. Tokens expire after one hour and requesting a new one
 * deletes any previous unused token for that account.
 */

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateResetToken(): string {
  // 32 bytes -> 43 base64url characters, the same shape as invitation
  // tokens. The route validates exactly this shape.
  return randomBytes(32).toString("base64url");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestPasswordReset(
  db: Database,
  params: { email: string },
): Promise<void> {
  const email = normalizeEmail(params.email);

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Unknown address, or no email provider to deliver the link. Either way
  // the caller returns the same generic message.
  if (!user || !isEmailConfigured()) return;

  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Only the newest link should work. This also keeps the table small.
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      createdAt: now,
    });
  });

  const resetUrl = new URL(
    `/reset-password?token=${encodeURIComponent(token)}`,
    siteUrl(),
  ).toString();

  const body = [
    `Hi ${user.name},`,
    "",
    `Someone requested a password reset for the ${BRAND.name} account tied to this address.`,
    "If that was you, open the link below within the next hour:",
    "",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email — your password has not changed.",
    "",
    `— ${BRAND.name}`,
  ].join("\n");

  try {
    await sendEmail({
      to: user.email,
      subject: `Reset your ${BRAND.name} password`,
      body,
    });
  } catch (error) {
    // The response must not reveal whether the address exists, so a
    // provider failure is logged rather than surfaced. The user can
    // request another link.
    console.error("[password-reset] delivery failed:", error);
  }
}

export async function resetPassword(
  db: Database,
  params: { token: string; password: string },
): Promise<void> {
  const tokenHash = hashResetToken(params.token);
  const now = new Date();

  // Look the token up first so an obviously invalid link does not pay for
  // a bcrypt hash.
  const [record] = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!record) throw new InvalidPasswordResetError();

  const passwordHash = await hashPassword(params.password);

  await db.transaction(async (tx) => {
    // Compare-and-set on `used_at` so two simultaneous submissions of the
    // same link cannot both succeed.
    const [claimed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.id, record.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({ id: passwordResetTokens.id });

    if (!claimed) throw new InvalidPasswordResetError();

    const [updated] = await tx
      .update(users)
      .set({
        passwordHash,
        // Revoke every existing session for this account.
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(users.id, record.userId))
      .returning({ id: users.id });

    if (!updated) throw new InvalidPasswordResetError();

    // Any other outstanding reset link for this account is now obsolete.
    await tx
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, record.userId),
          ne(passwordResetTokens.id, record.id),
        ),
      );
  });
}
