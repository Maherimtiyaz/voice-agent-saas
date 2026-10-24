import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Access your voice agent workspace.</CardDescription>
          </CardHeader>
          <LoginForm nextPath={nextPath} />
        </Card>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/" className="font-medium text-accent hover:underline">
            Back to the homepage
          </Link>
        </p>
      </div>
    </div>
  );
}
