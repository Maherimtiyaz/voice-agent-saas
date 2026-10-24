import { db } from "@/db";
import { drainEmailOutbox } from "@/server/services/email-outbox.service";

/**
 * Drains the email outbox.
 *
 * This is meant to be called by a scheduler (Vercel Cron, a GitHub
 * Action, or any HTTP cron) rather than by a user. It is protected by
 * a shared secret compared against `EMAIL_CRON_SECRET` — if that
 * variable is not set, the route is disabled entirely and returns 404,
 * so an unconfigured deployment does not expose an unauthenticated
 * trigger.
 *
 * The route is idempotent: it only sends rows that are still
 * `pending`, and each row is marked `sent` as soon as the provider
 * accepts it.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.EMAIL_CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: { message: "Not found." } },
      { status: 404 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return Response.json(
      { error: { message: "Unauthorized." } },
      { status: 401 },
    );
  }

  const result = await drainEmailOutbox(db);

  return Response.json(
    { data: result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
