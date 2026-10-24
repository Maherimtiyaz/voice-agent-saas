import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create your workspace",
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Create your workspace</CardTitle>
            <CardDescription>
              Set up the account that will own your voice agents.
            </CardDescription>
          </CardHeader>
          <RegisterForm />
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
