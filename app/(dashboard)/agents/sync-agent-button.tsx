"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { syncAgentWithVapiAction } from "@/app/actions/agent.actions";
import { Button } from "@/components/ui/button";

function SubmitButton({ hasSynced }: { hasSynced: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Syncing…" : hasSynced ? "Re-sync to Vapi" : "Sync to Vapi"}
    </Button>
  );
}

export function SyncAgentButton({
  agentId,
  hasSynced,
}: {
  agentId: string;
  hasSynced: boolean;
}) {
  const [state, formAction] = useActionState(syncAgentWithVapiAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="agentId" value={agentId} />
      <SubmitButton hasSynced={hasSynced} />
      {state?.message && <p className="text-sm text-danger">{state.message}</p>}
    </form>
  );
}
