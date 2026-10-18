import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getGoogleCalendarRedirectUri } from "@/server/integrations/google/calendar";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_calendar_oauth_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "google_calendar_oauth_verifier";

export interface GoogleOAuthRequest {
  authorizationUrl: string;
  nonce: string;
  codeVerifier: string;
}

function getStateSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export async function createGoogleOAuthRequest(params: {
  userId: string;
  organizationId: string;
}): Promise<GoogleOAuthRequest> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set.");

  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = await new SignJWT({
    organizationId: params.organizationId,
    nonce,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("voice-agent-saas")
    .setAudience("google-calendar")
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getStateSecret());

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCalendarRedirectUri(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  return { authorizationUrl: url.toString(), nonce, codeVerifier };
}

export async function verifyGoogleOAuthState(
  token: string,
): Promise<{ userId: string; organizationId: string; nonce: string }> {
  const { payload } = await jwtVerify(token, getStateSecret(), {
    algorithms: ["HS256"],
    issuer: "voice-agent-saas",
    audience: "google-calendar",
  });
  if (
    typeof payload.sub !== "string"
    || typeof payload.organizationId !== "string"
    || typeof payload.nonce !== "string"
  ) {
    throw new Error("Google Calendar OAuth state is incomplete.");
  }
  return {
    userId: payload.sub,
    organizationId: payload.organizationId,
    nonce: payload.nonce,
  };
}
