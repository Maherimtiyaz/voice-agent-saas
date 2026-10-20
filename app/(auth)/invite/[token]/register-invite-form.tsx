"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  registerAndAcceptOrganizationInviteAction,
} from "@/app/actions/organization-invite.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function RegisterButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating account…" : "Create account and join"}
    </Button>
  );
}

export function RegisterInviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(
    registerAndAcceptOrganizationInviteAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div>
        <Label htmlFor="inviteName">Your name</Label>
        <Input id="inviteName" name="name" autoComplete="name" required />
        <FieldError messages={state?.errors?.name} />
      </div>
      <div>
        <Label htmlFor="invitePassword">Password</Label>
        <Input
          id="invitePassword"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError messages={state?.errors?.password} />
        <p className="mt-1 text-xs text-muted">
          At least 8 characters, with a letter and a number.
        </p>
      </div>
      {state?.errors?.token && <p role="alert" className="text-sm text-danger">{state.errors.token[0]}</p>}
      {state?.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <RegisterButton />
    </form>
  );
}
