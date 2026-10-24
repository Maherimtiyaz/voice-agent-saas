"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { scheduleCampaignAction } from "@/app/actions/campaign.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import type { Campaign } from "@/db/schema";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Saving…" : "Save schedule"}
    </Button>
  );
}

/**
 * `datetime-local` needs a local `YYYY-MM-DDTHH:mm` value, not an ISO
 * string — converting back with the timezone offset avoids the input
 * showing a time that is several hours off.
 */
function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ScheduleForm({ campaign }: { campaign: Campaign }) {
  const [state, formAction] = useActionState(scheduleCampaignAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="campaignId" value={campaign.id} />
      <div>
        <Label htmlFor="scheduledAt">
          Start time (leave empty to start manually)
        </Label>
        <input
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          defaultValue={toLocalInputValue(campaign.scheduledAt)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <FieldError messages={state?.errors?.scheduledAt} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="dispatchIntervalSeconds">Seconds between calls</Label>
          <input
            id="dispatchIntervalSeconds"
            name="dispatchIntervalSeconds"
            type="number"
            min={10}
            max={86400}
            required
            defaultValue={campaign.dispatchIntervalSeconds}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <FieldError messages={state?.errors?.dispatchIntervalSeconds} />
        </div>
        <div>
          <Label htmlFor="maxAttempts">Attempts per contact</Label>
          <input
            id="maxAttempts"
            name="maxAttempts"
            type="number"
            min={1}
            max={10}
            required
            defaultValue={campaign.maxAttempts}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <FieldError messages={state?.errors?.maxAttempts} />
        </div>
      </div>
      <p className="text-xs text-muted">
        A call that cannot be placed at all (provider or network failure) is
        retried with backoff, up to the attempt limit. A call that simply goes
        unanswered is not retried.
      </p>
      {state?.message && (
        <p className={`text-sm ${state.success ? "text-accent" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
