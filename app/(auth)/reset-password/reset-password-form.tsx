"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/password-reset.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Updating…" : "Set new password"}
    </Button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />

      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError messages={state?.errors?.password} />
        <p className="mt-1 text-xs text-muted">
          8–72 characters, with a letter and a number.
        </p>
      </div>

      {state?.message && <p className="text-sm text-danger">{state.message}</p>}

      <SubmitButton />

      <p className="text-sm text-muted">
        Resetting your password signs out every device, including any session
        that may have been compromised.
      </p>

      <p className="text-center text-sm text-muted">
        <Link
          href="/forgot-password"
          className="font-medium text-accent hover:underline"
        >
          Request a new link
        </Link>
      </p>
    </form>
  );
}
