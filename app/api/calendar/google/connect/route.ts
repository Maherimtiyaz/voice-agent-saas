import { cookies } from "next/headers";
import { requireCurrentContext } from "@/server/auth/current-user";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  createGoogleOAuthRequest,
} from "@/server/integrations/google/oauth";

const CALLBACK_PATH = "/api/calendar/google/callback";

export async function GET(): Promise<Response> {
  const { user, organizationId } = await requireCurrentContext(["owner", "admin"]);
  const { authorizationUrl, nonce, codeVerifier } = await createGoogleOAuthRequest({
    userId: user.id,
    organizationId,
  });
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 10 * 60,
    path: CALLBACK_PATH,
  };
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, nonce, cookieOptions);
  cookieStore.set(GOOGLE_OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  return Response.redirect(authorizationUrl, 302);
}
