"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { acceptOrganizationInviteAction } from "@/app/actions/organization-invite.actions";
import { Button } from "@/components/ui/button";

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Joining workspace…" : "Accept invitation"}
    </Button>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptOrganizationInviteAction, undefined);
  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      <input type="hidden" name="token" value={token} />
      {state?.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <AcceptButton />
    </form>
  );
}
