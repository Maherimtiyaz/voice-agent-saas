"use server";

import { headers } from "next/headers";
import { db } from "@/db";
import { AppError } from "@/server/errors";
import { createDemoRequest } from "@/server/services/demo-request.service";
import { consumeRateLimit } from "@/server/services/rate-limit.service";
import { demoRequestSchema } from "@/server/validation/demo-request";

export interface DemoRequestActionState {
  errors?: Record<string, string[]>;
  message?: string;
  /** Set on success — the form is replaced with a thank-you panel. */
  success?: boolean;
}

/**
 * The best-effort client IP.
 *
 * `x-forwarded-for` is the first entry in the chain of proxies that
 * forwarded the request. On Vercel (and most other hosts) this is
 * set by the platform, not by the client, but a client CAN send its
 * own `x-forwarded-for` header and some hosts append to it rather
 * than replace it — so the LAST entry is the one the platform added
 * and is the least spoofable. We use it only to rate limit, never to
 * identify or contact anyone, so a spoofed value can at worst let one
 * caller reset their own limit.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headerList.get("x-real-ip") ?? "unknown";
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
    await createDemoRequest(db, parsed.data);
    return { success: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    throw error;
  }
}
