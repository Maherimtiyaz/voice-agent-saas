import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getHubSpotRedirectUri } from "@/server/integrations/hubspot/client";

export const HUBSPOT_OAUTH_STATE_COOKIE = "hubspot_oauth_state";

function getStateSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export async function createHubSpotAuthorization(params: {
  userId: string;
  organizationId: string;
}): Promise<{ authorizationUrl: string; nonce: string }> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) throw new Error("HUBSPOT_CLIENT_ID is not set.");

  const nonce = randomBytes(32).toString("base64url");
  const state = await new SignJWT({
    organizationId: params.organizationId,
    nonce,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("voice-agent-saas")
    .setAudience("hubspot-crm")
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getStateSecret());

  const url = new URL("https://app.hubspot.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getHubSpotRedirectUri(),
    scope: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.schemas.deals.read",
    ].join(" "),
    state,
  }).toString();

  return { authorizationUrl: url.toString(), nonce };
}

export async function verifyHubSpotOAuthState(
  token: string,
): Promise<{ userId: string; organizationId: string; nonce: string }> {
  const { payload } = await jwtVerify(token, getStateSecret(), {
    algorithms: ["HS256"],
    issuer: "voice-agent-saas",
    audience: "hubspot-crm",
  });
  if (
    typeof payload.sub !== "string"
    || typeof payload.organizationId !== "string"
    || typeof payload.nonce !== "string"
  ) {
    throw new Error("HubSpot OAuth state is incomplete.");
  }
  return {
    userId: payload.sub,
    organizationId: payload.organizationId,
    nonce: payload.nonce,
  };
}
