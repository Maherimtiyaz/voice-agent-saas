import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const validToken =
    typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
      ? token
      : null;

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            {validToken
              ? "Set a new password for your account."
              : "This reset link is incomplete."}
          </CardDescription>
        </CardHeader>

        {validToken ? (
          <ResetPasswordForm token={validToken} />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              The link you followed does not contain a reset token. Request a
              fresh one and use the link from that email.
            </p>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-accent hover:underline"
            >
              Request a password reset
            </Link>
          </div>
        )}
      </Card>
    </AuthShell>
  );
}
