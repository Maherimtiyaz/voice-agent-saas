import Link from "next/link";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { listAgents } from "@/server/services/agent.service";

export default async function DashboardOverviewPage() {
  const { user, organizationId, role } = await requireCurrentContext();
  const agents = await listAgents(db, { organizationId, userId: user.id });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Welcome back, {user.name}
        </h1>
        <p className="text-sm text-muted">
          You&apos;re signed in as <span className="font-medium">{role}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <CardDescription>
              {agents.length === 0
                ? "No agents yet."
                : `${agents.length} agent${agents.length === 1 ? "" : "s"} in this workspace.`}
            </CardDescription>
          </CardHeader>
          <Link
            href="/agents"
            className="inline-flex w-fit items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-black/[0.02]"
          >
            Manage agents
          </Link>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice calls</CardTitle>
            <CardDescription>
              Not set up yet — Twilio and Vapi connect in a later phase.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
