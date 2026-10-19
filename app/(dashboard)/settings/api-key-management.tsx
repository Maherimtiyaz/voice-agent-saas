"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createWorkspaceApiKeyAction,
  revokeWorkspaceApiKeyAction,
} from "@/app/actions/api-key.actions";
import type { ApiKeySummary } from "@/server/services/api-key.service";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create API key"}
    </Button>
  );
}

export function ApiKeyManagement({ apiKeys }: { apiKeys: ApiKeySummary[] }) {
  const [state, formAction] = useActionState(createWorkspaceApiKeyAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.token) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-sm">
            <Label htmlFor="apiKeyName">Key name</Label>
            <Input id="apiKeyName" name="name" maxLength={80} required placeholder="Production integration" />
            <FieldError messages={state?.errors?.name} />
          </div>
          <CreateButton />
        </form>
      </div>

      {state?.token && (
        <div className="rounded-md border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-foreground">
            Copy this key now — it will not be shown again.
          </p>
          <p className="mt-2 break-all rounded bg-surface p-3 font-mono text-xs text-foreground">
            {state.token}
          </p>
        </div>
      )}

      {state?.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}

      {apiKeys.length === 0 ? (
        <p className="text-sm text-muted">No API keys have been created.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {apiKeys.map((apiKey) => (
                <tr key={apiKey.id}>
                  <td className="px-4 py-2 text-foreground">{apiKey.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{apiKey.keyPrefix}…</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {apiKey.lastUsedAt?.toLocaleString() ?? "Never"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {apiKey.revokedAt ? "Revoked" : "Active"}
                  </td>
                  <td className="px-4 py-2">
                    {!apiKey.revokedAt && (
                      <form action={revokeWorkspaceApiKeyAction}>
                        <input type="hidden" name="apiKeyId" value={apiKey.id} />
                        <Button type="submit" variant="danger">Revoke</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
