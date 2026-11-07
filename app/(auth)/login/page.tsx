import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  // Utility page: keep it out of search results even if a crawler
  // ignores robots.txt.
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; signedOut?: string }>;
}) {
  const { next, reset, signedOut } = await searchParams;
  const nextPath =
    next && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(next) ? next : undefined;
  const notice =
    reset === "1"
      ? "Password updated. Sign in with your new password — every previous session has been signed out."
      : signedOut === "everywhere"
        ? "You have been signed out on every device."
        : undefined;

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your voice agent workspace.</CardDescription>
        </CardHeader>
        <LoginForm nextPath={nextPath} notice={notice} />
      </Card>
    </AuthShell>
  );
}
