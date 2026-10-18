import { cookies } from "next/headers";
import { requireCurrentContext } from "@/server/auth/current-user";
import {
  createHubSpotAuthorization,
  HUBSPOT_OAUTH_STATE_COOKIE,
} from "@/server/integrations/hubspot/oauth";

const CALLBACK_PATH = "/api/crm/hubspot/callback";

export async function GET(): Promise<Response> {
  const { user, organizationId } = await requireCurrentContext(["owner", "admin"]);
  const { authorizationUrl, nonce } = await createHubSpotAuthorization({
    userId: user.id,
    organizationId,
  });
  const cookieStore = await cookies();
  cookieStore.set(HUBSPOT_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: CALLBACK_PATH,
  });

  return Response.redirect(authorizationUrl, 302);
}
