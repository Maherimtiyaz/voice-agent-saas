"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createOrganizationInviteAction,
  revokeOrganizationInviteAction,
} from "@/app/actions/organization-invite.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PendingOrganizationInvite } from "@/server/services/organization-invite.service";

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating link…" : "Create invite link"}
    </Button>
  );
}

export function OrganizationInviteManagement({
  invites,
  canInviteAdmin,
}: {
  invites: PendingOrganizationInvite[];
  canInviteAdmin: boolean;
}) {
  const [state, formAction] = useActionState(createOrganizationInviteAction, undefined);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyInviteLink() {
    if (!state?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopied(false);
      setCopyError("Clipboard access was blocked. Select and copy the link manually.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm">
          <Label htmlFor="inviteEmail">Email address</Label>
          <Input
            id="inviteEmail"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="teammate@example.com"
            required
          />
          <FieldError messages={state?.errors?.email} />
        </div>
        <div>
          <Label htmlFor="inviteRole">Workspace role</Label>
          <select
            id="inviteRole"
            name="role"
            defaultValue="member"
            className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="member">Member</option>
            {canInviteAdmin && <option value="admin">Admin</option>}
          </select>
          <FieldError messages={state?.errors?.role} />
        </div>
        <InviteButton />
      </form>

      {state?.message && (
        <p role={state.inviteUrl ? "status" : "alert"} className="text-sm text-muted">
          {state.message}
        </p>
      )}

      {state?.inviteUrl && (
        <div className="rounded-md border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-foreground">
            {state.emailed
              ? "This link is shown only once, in case you need to resend it. Anyone with it can join as the invited email."
              : "This link is shown only once. Anyone with it can join as the invited email."}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Invitation link" readOnly value={state.inviteUrl} />
            <Button type="button" variant="secondary" onClick={copyInviteLink}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {copyError && <p role="alert" className="mt-2 text-sm text-danger">{copyError}</p>}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium text-foreground">Pending invitations</h3>
        {invites.length === 0 ? (
          <p className="text-sm text-muted">No pending invitations.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{invite.email}</p>
                  <p className="text-xs capitalize text-muted">
                    {invite.role} · expires {invite.expiresAt.toLocaleDateString()}
                  </p>
                </div>
                <form action={revokeOrganizationInviteAction}>
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <Button type="submit" variant="secondary">Revoke</Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
