import { db } from "@/db";
import { runCampaignTick } from "@/server/services/campaign-dispatch.service";

/**
 * Runs one pass of the campaign scheduler.
 *
 * Meant to be called by a scheduler (Vercel Cron, a GitHub Action, or any
 * HTTP cron), not by a user. It is protected by a shared secret compared
 * against `CAMPAIGN_CRON_SECRET`; when that variable is unset the route
 * returns 404, so an unconfigured deployment has no unauthenticated
 * trigger.
 *
 * Safe to call repeatedly and concurrently: claiming a contact is a
 * compare-and-set on the campaign row, so two overlapping ticks cannot
 * both dial the same contact. Each tick places at most one call per
 * campaign, which is what keeps pacing predictable.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CAMPAIGN_CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: { message: "Not found." } },
      { status: 404 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { message: "Unauthorized." } },
      { status: 401 },
    );
  }

  const result = await runCampaignTick(db);

  return Response.json(
    { data: result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
