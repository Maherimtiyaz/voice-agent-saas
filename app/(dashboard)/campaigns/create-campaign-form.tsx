"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createCampaignAction } from "@/app/actions/campaign.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Agent, PhoneNumber } from "@/db/schema";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create campaign"}
    </Button>
  );
}

export function CreateCampaignForm({
  agents,
  phoneNumbers,
}: {
  agents: Agent[];
  phoneNumbers: PhoneNumber[];
}) {
  const [state, formAction] = useActionState(createCampaignAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="campaignName">Campaign name</Label>
          <Input id="campaignName" name="name" required maxLength={120} />
          <FieldError messages={state?.errors?.name} />
        </div>
        <div>
          <Label htmlFor="campaignAgent">Agent</Label>
          <select
            id="campaignAgent"
            name="agentId"
            required
            defaultValue=""
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="" disabled>Select an agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          <FieldError messages={state?.errors?.agentId} />
        </div>
        <div>
          <Label htmlFor="campaignPhoneNumber">Caller ID</Label>
          <select
            id="campaignPhoneNumber"
            name="phoneNumberId"
            required
            defaultValue=""
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="" disabled>Select a phone number</option>
            {phoneNumbers.map((phoneNumber) => (
              <option key={phoneNumber.id} value={phoneNumber.id}>
                {phoneNumber.e164Number}
              </option>
            ))}
          </select>
          <FieldError messages={state?.errors?.phoneNumberId} />
        </div>
      </div>
      {state?.message && <p className="text-sm text-danger">{state.message}</p>}
      <div><SubmitButton /></div>
    </form>
  );
}
