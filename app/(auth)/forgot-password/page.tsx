import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter the email address on your account and we&apos;ll send a
            one-hour reset link.
          </CardDescription>
        </CardHeader>
        <ForgotPasswordForm />
      </Card>
    </AuthShell>
  );
}
