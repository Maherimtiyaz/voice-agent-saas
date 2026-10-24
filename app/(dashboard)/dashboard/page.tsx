import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { requireCurrentContext } from "@/server/auth/current-user";
import { listAgents } from "@/server/services/agent.service";
import { listPhoneNumbers } from "@/server/services/phone-number.service";
import { getOnboardingStatus } from "@/server/services/onboarding.service";
import { getCallSummary } from "@/server/services/analytics.service";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function DashboardOverviewPage() {
  const { user, organizationId, role } = await requireCurrentContext();

  const [agents, phoneNumbers, onboarding, callSummary] = await Promise.all([
    listAgents(db, { organizationId, userId: user.id }),
    listPhoneNumbers(db, { organizationId, userId: user.id }),
    getOnboardingStatus(db, { organizationId, userId: user.id }),
    getCallSummary(db, { organizationId, userId: user.id }),
  ]);

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

      <OnboardingChecklist status={onboarding} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Agents"
          value={agents.length}
          href="/agents"
          emptyHint="Create your first agent to start taking calls."
        />
        <StatCard
          label="Phone numbers"
          value={phoneNumbers.length}
          href="/phone-numbers"
          emptyHint="Register a Twilio number for your agent to answer on."
        />
        <StatCard
          label="Calls handled"
          value={callSummary.totalCalls}
          href="/calls"
          emptyHint="Calls appear here once your agent starts answering."
        />
        <StatCard
          label="Appointments booked"
          value={callSummary.byOutcome.appointment_booked ?? 0}
          href="/analytics"
          emptyHint="Connect a calendar so the agent can book real appointments."
        />
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
            <CardTitle>Calls</CardTitle>
            <CardDescription>
              {callSummary.totalCalls === 0
                ? "No calls yet — once your number is live, inbound and outbound calls show up here with their transcripts."
                : `${callSummary.totalCalls} call${callSummary.totalCalls === 1 ? "" : "s"} recorded${
                    callSummary.averageDurationSeconds != null
                      ? `, averaging ${callSummary.averageDurationSeconds}s`
                      : ""
                  }.`}
            </CardDescription>
          </CardHeader>
          <Link
            href="/calls"
            className="inline-flex w-fit items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-black/[0.02]"
          >
            View calls
          </Link>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  emptyHint,
}: {
  label: string;
  value: number;
  href: string;
  emptyHint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-black/[0.02]"
    >
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {value === 0 && (
        <p className="mt-1 text-xs text-muted">{emptyHint}</p>
      )}
    </Link>
  );
}
