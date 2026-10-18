import { cookies } from "next/headers";
import { db } from "@/db";
import {
  exchangeHubSpotAuthorizationCode,
  saveHubSpotConnection,
} from "@/server/integrations/hubspot/client";
import {
  HUBSPOT_OAUTH_STATE_COOKIE,
  verifyHubSpotOAuthState,
} from "@/server/integrations/hubspot/oauth";
import { requireMembership } from "@/server/services/organization.service";

const CALLBACK_PATH = "/api/crm/hubspot/callback";

function settingsRedirect(status: string): Response {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set.");
  return Response.redirect(new URL(`/settings?crm=${status}`, appUrl), 302);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(HUBSPOT_OAUTH_STATE_COOKIE)?.value;
  cookieStore.set(HUBSPOT_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: CALLBACK_PATH,
  });

  if (url.searchParams.has("error")) return settingsRedirect("cancelled");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !nonceCookie) return settingsRedirect("error");

  try {
    const verifiedState = await verifyHubSpotOAuthState(state);
    if (verifiedState.nonce !== nonceCookie) return settingsRedirect("error");
    await requireMembership(db, {
      organizationId: verifiedState.organizationId,
      userId: verifiedState.userId,
      allowedRoles: ["owner", "admin"],
    });

    const tokens = await exchangeHubSpotAuthorizationCode(code);
    if (!tokens.refresh_token) {
      throw new Error("HubSpot did not return a refresh token.");
    }
    await saveHubSpotConnection(db, verifiedState.organizationId, tokens.refresh_token);
    return settingsRedirect("connected");
  } catch (error) {
    console.error("[crm] HubSpot OAuth callback failed", error);
    return settingsRedirect("error");
  }
}
