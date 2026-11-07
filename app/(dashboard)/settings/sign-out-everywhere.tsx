"use client";

import { useFormStatus } from "react-dom";
import { logoutEverywhereAction } from "@/app/actions/auth.actions";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      disabled={pending}
      onClick={(event) => {
        const confirmed = window.confirm(
          "Sign out every device? You will need to sign in again everywhere, including here.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      {pending ? "Signing out…" : "Sign out everywhere"}
    </Button>
  );
}

export function SignOutEverywhere() {
  return (
    <form action={logoutEverywhereAction}>
      <SubmitButton />
    </form>
  );
}
