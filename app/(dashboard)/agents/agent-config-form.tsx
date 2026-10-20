"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateAgentConfigAction } from "@/app/actions/agent.actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function AgentConfigForm({
  agentId,
  systemPrompt,
  transferNumber,
  voiceProvider,
}: {
  agentId: string;
  systemPrompt: string | null;
  transferNumber: string | null;
  voiceProvider: "vapi" | "openai_realtime";
}) {
  const [state, formAction] = useActionState(updateAgentConfigAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-border pt-3">
      <input type="hidden" name="agentId" value={agentId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`voiceProvider-${agentId}`}>Voice orchestration</Label>
        <select
          id={`voiceProvider-${agentId}`}
          name="voiceProvider"
          defaultValue={voiceProvider}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="vapi">Vapi managed voice</option>
          <option value="openai_realtime">Custom (Twilio Media Streams + OpenAI Realtime)</option>
        </select>
        <p className="text-xs text-muted">
          Custom voice requires a running Media Streams service and OpenAI API credentials.
        </p>
      </div>
      <div>
        <Label htmlFor={`systemPrompt-${agentId}`}>System prompt</Label>
        <textarea
          id={`systemPrompt-${agentId}`}
          name="systemPrompt"
          rows={3}
          defaultValue={systemPrompt ?? ""}
          placeholder="You are a helpful phone assistant for..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <FieldError messages={state?.errors?.systemPrompt} />
      </div>
      <div>
        <Label htmlFor={`transferNumber-${agentId}`}>Live-transfer number</Label>
        <Input
          id={`transferNumber-${agentId}`}
          name="transferNumber"
          placeholder="+14155551234"
          defaultValue={transferNumber ?? ""}
        />
        <p className="mt-1 text-xs text-muted">
          The only number the transfer_call tool is allowed to use — never
          set by the caller or the LLM.
        </p>
        <FieldError messages={state?.errors?.transferNumber} />
      </div>
      {state?.message && <p className="text-sm text-danger">{state.message}</p>}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
