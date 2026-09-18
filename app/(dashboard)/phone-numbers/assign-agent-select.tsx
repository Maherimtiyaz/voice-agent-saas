"use client";

import { useRef } from "react";
import { assignAgentToPhoneNumberAction } from "@/app/actions/phone-number.actions";
import type { Agent } from "@/db/schema";

export function AssignAgentSelect({
  phoneNumberId,
  agents,
  currentAgentId,
}: {
  phoneNumberId: string;
  agents: Agent[];
  currentAgentId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={assignAgentToPhoneNumberAction}>
      <input type="hidden" name="phoneNumberId" value={phoneNumberId} />
      <select
        name="agentId"
        defaultValue={currentAgentId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
        aria-label="Assign agent"
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </form>
  );
}
