"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createAgentAction } from "@/app/actions/agent.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create agent"}
    </Button>
  );
}

export function CreateAgentForm() {
  const [state, formAction] = useActionState(createAgentAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the input after a successful create.
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Label htmlFor="agent-name">Agent name</Label>
        <Input id="agent-name" name="name" placeholder="Front Desk Assistant" required />
        <FieldError messages={state?.errors?.name} />
        {state?.message && <p className="mt-1 text-sm text-danger">{state.message}</p>}
      </div>
      <div className="pt-0 sm:pt-6">
        <SubmitButton />
      </div>
    </form>
  );
}
