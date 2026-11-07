"use server";

import { headers } from "next/headers";
import { db } from "@/db";
import type { DemoRequest } from "@/db/schema";
import { getClientIp } from "@/lib/client-ip";
import { AppError } from "@/server/errors";
import { isEmailConfigured, sendEmail } from "@/server/integrations/email/client";
import { createDemoRequest } from "@/server/services/demo-request.service";
import { consumeRateLimit } from "@/server/services/rate-limit.service";
import { demoRequestSchema } from "@/server/validation/demo-request";

export interface DemoRequestActionState {
  errors?: Record<string, string[]>;
  message?: string;
  /** Set on success — the form is replaced with a thank-you panel. */
  success?: boolean;
}

async function clientIp(): Promise<string> {
  return getClientIp(await headers());
}

/**
 * Emails the team when a lead arrives.
 *
 * Deliberately best-effort and outside the request's success path: a
 * lead that is stored is a success even if the notification fails. It
 * sends directly rather than through the outbox because
 * `email_outbox.organization_id` is NOT NULL and a demo request has no
 * organization — queuing it would mean inventing a tenant.
 *
 * Silently does nothing when `DEMO_NOTIFICATION_EMAIL` or the email
 * provider is unset, which is the correct behaviour for local dev.
 */
async function notifyNewLead(lead: DemoRequest): Promise<void> {
  const to = process.env.DEMO_NOTIFICATION_EMAIL?.trim();
  if (!to || !isEmailConfigured()) return;

  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  const inbox = appUrl ? `${appUrl}/api/admin/demo-requests` : null;

  const lines = [
    `${lead.name} just requested a demo.`,
    "",
    `Name:        ${lead.name}`,
    `Email:       ${lead.email}`,
    `Company:     ${lead.company ?? "—"}`,
    `Phone:       ${lead.phone ?? "—"}`,
    `Use case:    ${lead.useCase ?? "—"}`,
    `Call volume: ${lead.callVolume ?? "—"}`,
    "",
    "Message:",
    lead.message ?? "—",
    "",
    `Received: ${lead.updatedAt.toISOString()}`,
    inbox ? `Lead inbox: ${inbox}` : null,
    "",
    "Reply from your normal mailbox — this address only sends.",
  ].filter((line) => line !== null);

  await sendEmail({
    to,
    subject: `New demo request: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
    body: lines.join("\n"),
  });
}

export async function submitDemoRequestAction(
  _previous: DemoRequestActionState | undefined,
  formData: FormData,
): Promise<DemoRequestActionState> {
  const parsed = demoRequestSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company") ?? "",
    phone: formData.get("phone") ?? "",
    useCase: formData.get("useCase") ?? "",
    callVolume: formData.get("callVolume") ?? "",
    message: formData.get("message") ?? "",
    website: formData.get("website") ?? "",
  });

  // A filled honeypot means a bot. Report success so the bot does not
  // learn to retry, but do not store anything.
  if (parsed.success && parsed.data.website) {
    return { success: true };
  }

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const ip = await clientIp();
  const limit = await consumeRateLimit(db, {
    bucket: "demo_request",
    key: ip,
  });

  if (!limit.allowed) {
    return {
      message: `Too many requests. Please try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
    };
  }

  try {
    const lead = await createDemoRequest(db, parsed.data);

    try {
      await notifyNewLead(lead);
    } catch (error) {
      // The lead is already saved; a failed notification must never turn
      // into a failed form submission. Log it so it is visible in ops.
      console.error("[demo-request] lead notification failed:", error);
    }

    return { success: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    throw error;
  }
}
