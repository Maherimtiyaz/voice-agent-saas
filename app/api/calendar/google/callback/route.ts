import { cookies } from "next/headers";
import { db } from "@/db";
import {
  exchangeGoogleAuthorizationCode,
  saveGoogleCalendarConnection,
} from "@/server/integrations/google/calendar";
import { requireMembership } from "@/server/services/organization.service";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  verifyGoogleOAuthState,
} from "@/server/integrations/google/oauth";

const CALLBACK_PATH = "/api/calendar/google/callback";

function settingsRedirect(status: string): Response {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set.");
  return Response.redirect(new URL(`/settings?calendar=${status}`, appUrl), 302);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value;
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: CALLBACK_PATH,
  });
  cookieStore.set(GOOGLE_OAUTH_VERIFIER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: CALLBACK_PATH,
  });

  if (url.searchParams.has("error")) return settingsRedirect("cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !nonceCookie || !codeVerifier) {
    return settingsRedirect("error");
  }

  try {
    const verifiedState = await verifyGoogleOAuthState(state);
    if (verifiedState.nonce !== nonceCookie) {
      return settingsRedirect("error");
    }

    await requireMembership(db, {
      organizationId: verifiedState.organizationId,
      userId: verifiedState.userId,
      allowedRoles: ["owner", "admin"],
    });

    const tokens = await exchangeGoogleAuthorizationCode(code, codeVerifier);
    await saveGoogleCalendarConnection(db, verifiedState.organizationId, tokens.refresh_token);
    return settingsRedirect("connected");
  } catch (error) {
    console.error("[calendar] Google OAuth callback failed", error);
    return settingsRedirect("error");
  }
}
