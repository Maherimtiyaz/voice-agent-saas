"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitDemoRequestAction } from "@/app/actions/demo-request.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Sending…" : "Request a demo"}
    </Button>
  );
}

export function DemoRequestForm() {
  const [state, formAction] = useActionState(submitDemoRequestAction, undefined);

  if (state?.success) {
    return (
      <div
        role="status"
        className="rounded-lg border border-accent/30 bg-accent/5 p-6"
      >
        <h3 className="text-base font-semibold text-foreground">
          Thanks — we&apos;ve got it.
        </h3>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll review the details you sent and get back to you shortly to
          set up a time. If it&apos;s urgent, reply to the email you receive
          from us.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="demo-name">Name</Label>
          <Input
            id="demo-name"
            name="name"
            autoComplete="name"
            placeholder="Jordan Reyes"
            required
          />
          <FieldError messages={state?.errors?.name} />
        </div>

        <div>
          <Label htmlFor="demo-email">Work email</Label>
          <Input
            id="demo-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="jordan@company.com"
            required
          />
          <FieldError messages={state?.errors?.email} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="demo-company">Company</Label>
          <Input
            id="demo-company"
            name="company"
            autoComplete="organization"
            placeholder="Acme Plumbing"
          />
          <FieldError messages={state?.errors?.company} />
        </div>

        <div>
          <Label htmlFor="demo-phone">Phone</Label>
          <Input
            id="demo-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 010 0100"
          />
          <FieldError messages={state?.errors?.phone} />
        </div>
      </div>

      <div>
        <Label htmlFor="demo-use-case">
          What should the agent handle on your calls?
        </Label>
        <textarea
          id="demo-use-case"
          name="useCase"
          rows={3}
          placeholder="Qualify new enquiries, book service visits, and reschedule existing appointments."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <FieldError messages={state?.errors?.useCase} />
      </div>

      <div>
        <Label htmlFor="demo-call-volume">Expected call volume</Label>
        <select
          id="demo-call-volume"
          name="callVolume"
          defaultValue=""
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">Not sure yet</option>
          <option value="under_10">Under 10 calls a day</option>
          <option value="10_50">10&ndash;50 calls a day</option>
          <option value="50_200">50&ndash;200 calls a day</option>
          <option value="over_200">More than 200 calls a day</option>
        </select>
        <FieldError messages={state?.errors?.callVolume} />
      </div>

      <div>
        <Label htmlFor="demo-message">Anything else?</Label>
        <textarea
          id="demo-message"
          name="message"
          rows={3}
          placeholder="Which calendar or CRM do you use?"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <FieldError messages={state?.errors?.message} />
      </div>

      {/* Honeypot: hidden from people, visible to naive bots. */}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="demo-website">Website</label>
        <input id="demo-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton />
        <p className="text-xs text-muted">
          We&apos;ll only use these details to set up your demo.
        </p>
      </div>
    </form>
  );
}
