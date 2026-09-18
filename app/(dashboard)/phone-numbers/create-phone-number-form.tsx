"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createPhoneNumberAction } from "@/app/actions/phone-number.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Agent } from "@/db/schema";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add phone number"}
    </Button>
  );
}

export function CreatePhoneNumberForm({ agents }: { agents: Agent[] }) {
  const [state, formAction] = useActionState(createPhoneNumberAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="e164Number">Phone number</Label>
          <Input id="e164Number" name="e164Number" placeholder="+14155551234" required />
          <FieldError messages={state?.errors?.e164Number} />
        </div>
        <div>
          <Label htmlFor="twilioNumberSid">Twilio number SID</Label>
          <Input id="twilioNumberSid" name="twilioNumberSid" placeholder="PNxxxxxxxx…" required />
          <FieldError messages={state?.errors?.twilioNumberSid} />
        </div>
        <div>
          <Label htmlFor="vapiPhoneNumberId">Vapi phone number ID (optional)</Label>
          <Input id="vapiPhoneNumberId" name="vapiPhoneNumberId" placeholder="From importing this number into Vapi" />
          <FieldError messages={state?.errors?.vapiPhoneNumberId} />
        </div>
        <div>
          <Label htmlFor="agentId">Assign an agent (optional)</Label>
          <select
            id="agentId"
            name="agentId"
            defaultValue=""
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state?.message && <p className="text-sm text-danger">{state.message}</p>}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
