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
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath =
    next && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(next) ? next : undefined;

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your voice agent workspace.</CardDescription>
        </CardHeader>
        <LoginForm nextPath={nextPath} />
      </Card>
    </AuthShell>
  );
}
