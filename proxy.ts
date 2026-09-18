import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

const PROTECTED_PREFIXES = ["/dashboard", "/agents", "/settings", "/phone-numbers", "/calls", "/analytics"];
const AUTH_ROUTES = ["/login", "/register"];

/**
 * This is an OPTIMISTIC check only — it reads the cookie, not the
 * database, so it's safe to run on every request without hammering
 * Postgres. It exists to bounce obviously-unauthenticated requests
 * before they render. The real authorization checks (membership,
 * role) live in the service layer via `requireCurrentContext`, which
 * runs on the actual data path — that's the line of defense that
 * matters for security, not this one.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await decryptSession(token);

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthRoute = AUTH_ROUTES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico)$).*)"],
};
