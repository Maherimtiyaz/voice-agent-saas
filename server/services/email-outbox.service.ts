import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { emailOutbox } from "@/db/schema";
import type { EmailOutboxEntry } from "@/db/schema";
import {
  EmailDeliveryError,
  isEmailConfigured,
  sendEmail,
} from "@/server/integrations/email/client";

/**
 * The email outbox: a durable, transactional queue for transactional
 * email.
 *
 * The point of the outbox pattern is that "create the invite" and
 * "record that an email needs to go out" happen in the SAME database
 * transaction. If the process dies between those two writes, there is
 * no state where an invite exists but nobody was ever told about it.
 * Delivery itself happens afterwards, outside the transaction, and its
 * success/failure is recorded on the row.
 */

export interface QueueEmailParams {
  organizationId: string;
  to: string;
  subject: string;
  body: string;
  kind?: string;
}

/**
 * Queues an email. MUST be called inside the same transaction as the
 * business change that caused it.
 */
export async function queueEmail(
  db: Database,
  params: QueueEmailParams,
): Promise<EmailOutboxEntry> {
  const [entry] = await db
    .insert(emailOutbox)
    .values({
      organizationId: params.organizationId,
      toEmail: params.to,
      subject: params.subject,
      body: params.body,
      kind: params.kind ?? "organization_invite",
    })
    .returning();

  return entry;
}

export interface DrainResult {
  sent: number;
  failed: number;
}

/**
 * Attempts to deliver queued emails.
 *
 * Each row is attempted independently: one bad address does not stop
 * the rest. A row that fails is left in `pending` with its attempt
 * count and error recorded, so a later run retries it; once it has
 * been attempted `maxAttempts` times it is marked `failed` and left
 * alone, because a permanently-bouncing address should not be retried
 * forever.
 */
export async function drainEmailOutbox(
  db: Database,
  params: { limit?: number; maxAttempts?: number } = {},
): Promise<DrainResult> {
  if (!isEmailConfigured()) {
    return { sent: 0, failed: 0 };
  }

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const maxAttempts = Math.max(params.maxAttempts ?? 5, 1);

  const pending = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.status, "pending"))
    .orderBy(asc(emailOutbox.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const entry of pending) {
    if (entry.attempts >= maxAttempts) {
      await db
        .update(emailOutbox)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(emailOutbox.id, entry.id),
            eq(emailOutbox.status, "pending"),
          ),
        );
      failed += 1;
      continue;
    }

    try {
      await sendEmail({
        to: entry.toEmail,
        subject: entry.subject,
        body: entry.body,
      });
      await db
        .update(emailOutbox)
        .set({
          status: "sent",
          sentAt: new Date(),
          attempts: entry.attempts + 1,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, entry.id));
      sent += 1;
    } catch (error) {
      const message =
        error instanceof EmailDeliveryError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown email delivery error.";
      await db
        .update(emailOutbox)
        .set({
          attempts: entry.attempts + 1,
          lastError: message,
          // A row that has exhausted its attempts is parked as
          // `failed`; otherwise it stays `pending` for the next run.
          status:
            entry.attempts + 1 >= maxAttempts ? "failed" : "pending",
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, entry.id));
      failed += 1;
    }
  }

  return { sent, failed };
}

/** Queued emails for a workspace, newest first — for the settings UI. */
export async function listOrganizationEmails(
  db: Database,
  params: { organizationId: string },
): Promise<EmailOutboxEntry[]> {
  return db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.organizationId, params.organizationId))
    .orderBy(asc(emailOutbox.createdAt));
}
