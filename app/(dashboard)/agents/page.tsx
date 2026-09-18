import type { Metadata } from "next";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { listAgents } from "@/server/services/agent.service";
import { CreateAgentForm } from "./create-agent-form";
import { SyncAgentButton } from "./sync-agent-button";
import { AgentConfigForm } from "./agent-config-form";

export const metadata: Metadata = {
  title: "Agents",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-black/[0.06] text-foreground",
  active: "bg-accent/10 text-accent",
  disabled: "bg-black/[0.06] text-muted",
};

export default async function AgentsPage() {
  const { user, organizationId } = await requireCurrentContext();
  const agents = await listAgents(db, { organizationId, userId: user.id });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted">
          Sync an agent to Vapi, then assign it to a phone number to start
          taking real calls.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New agent</CardTitle>
          <CardDescription>Give it a name to get started.</CardDescription>
        </CardHeader>
        <CreateAgentForm />
      </Card>

      {agents.length === 0 ? (
        <Card className="items-center text-center">
          <CardHeader>
            <CardTitle>No agents yet</CardTitle>
            <CardDescription>
              Create your first agent above, then sync it to Vapi and assign
              it to a phone number.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {agents.map((agent) => (
            <div key={agent.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{agent.name}</p>
                  <p className="font-mono text-xs text-muted">{agent.id}</p>
                  <p className="mt-1 text-xs text-muted">
                    {agent.vapiAssistantId
                      ? `Synced — Vapi assistant ${agent.vapiAssistantId}`
                      : "Not synced to Vapi yet"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                      STATUS_STYLES[agent.status] ?? STATUS_STYLES.draft
                    }`}
                  >
                    {agent.status}
                  </span>
                  <SyncAgentButton agentId={agent.id} hasSynced={Boolean(agent.vapiAssistantId)} />
                </div>
              </div>
              <AgentConfigForm
                agentId={agent.id}
                systemPrompt={agent.systemPrompt}
                transferNumber={agent.transferNumber}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
