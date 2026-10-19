"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addCampaignContactsAction } from "@/app/actions/campaign.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Adding…" : "Add contacts"}
    </Button>
  );
}

export function AddContactsForm({ campaignId }: { campaignId: string }) {
  const [state, formAction] = useActionState(addCampaignContactsAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div>
        <Label htmlFor="campaignContacts">Phone numbers (one E.164 number per line, up to 500)</Label>
        <textarea
          id="campaignContacts"
          name="phoneNumbers"
          required
          rows={5}
          placeholder={"+14155551234\n+442071838750"}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <FieldError messages={state?.errors?.phoneNumbers} />
      </div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="consentConfirmed"
          required
          className="mt-1 accent-[var(--color-accent)]"
        />
        <span>I confirm that every number listed has consented to receive calls from this organization.</span>
      </label>
      <FieldError messages={state?.errors?.consentConfirmed} />
      {state?.message && (
        <p className={`text-sm ${state.success ? "text-accent" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <div><SubmitButton /></div>
    </form>
  );
}
