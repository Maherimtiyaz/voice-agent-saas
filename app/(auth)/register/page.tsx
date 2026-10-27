import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create your workspace",
};

export default function RegisterPage() {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>
            Set up the account that will own your voice agents.
          </CardDescription>
        </CardHeader>
        <RegisterForm />
      </Card>
    </AuthShell>
  );
}
