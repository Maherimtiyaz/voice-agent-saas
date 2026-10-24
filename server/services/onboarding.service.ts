import "server-only";
import { and, count, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/db";
import { agents, calls, phoneNumbers } from "@/db/schema";
import { requireMembership } from "@/server/services/organization.service";

/**
 * First-run onboarding progress.
 *
 * This deliberately DERIVES its state from the workspace's real data
 * (agents, synced assistants, phone numbers, calls) rather than
 * storing a "step N of M" flag. A checklist that can drift out of sync
 * with reality is worse than no checklist: a user who has already
 * taken a test call should not be told to go take one. Because it is
 * derived, it is always correct, and it costs four cheap counts.
 *
 * The steps mirror the actual setup path documented in the README:
 * create an agent -> sync it to Vapi -> register a phone number and
 * assign it -> make a test call.
 */

export type OnboardingStepId =
  | "create_agent"
  | "sync_agent"
  | "register_number"
  | "assign_number"
  | "test_call";

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  /** Where the "do it" link points. */
  href: string;
  /** Whether the step is finished. */
  complete: boolean;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  /** Number of finished steps. */
  completedCount: number;
  /** Total number of steps. */
  totalCount: number;
  /** True once every step is done — the checklist can be dismissed. */
  isComplete: boolean;
}

export async function getOnboardingStatus(
  db: Database,
  params: { organizationId: string; userId: string },
): Promise<OnboardingStatus> {
  await requireMembership(db, params);

  const [agentCount] = await db
    .select({ total: count() })
    .from(agents)
    .where(eq(agents.organizationId, params.organizationId));

  const [syncedAgentCount] = await db
    .select({ total: count() })
    .from(agents)
    .where(
      and(
        eq(agents.organizationId, params.organizationId),
        isNotNull(agents.vapiAssistantId),
      ),
    );

  const [numberCount] = await db
    .select({ total: count() })
    .from(phoneNumbers)
    .where(eq(phoneNumbers.organizationId, params.organizationId));

  const [assignedNumberCount] = await db
    .select({ total: count() })
    .from(phoneNumbers)
    .where(
      and(
        eq(phoneNumbers.organizationId, params.organizationId),
        isNotNull(phoneNumbers.agentId),
      ),
    );

  const [callCount] = await db
    .select({ total: count() })
    .from(calls)
    .where(eq(calls.organizationId, params.organizationId));

  const hasAgent = (agentCount?.total ?? 0) > 0;
  const hasSyncedAgent = (syncedAgentCount?.total ?? 0) > 0;
  const hasNumber = (numberCount?.total ?? 0) > 0;
  const hasAssignedNumber = (assignedNumberCount?.total ?? 0) > 0;
  const hasCall = (callCount?.total ?? 0) > 0;

  const steps: OnboardingStep[] = [
    {
      id: "create_agent",
      title: "Create your first agent",
      description:
        "Name the agent that will answer your calls — for example, a receptionist or booking line.",
      href: "/agents",
      complete: hasAgent,
    },
    {
      id: "sync_agent",
      title: "Sync the agent to Vapi",
      description:
        "Sync pushes your agent's prompt and voice to the voice runtime that will answer calls.",
      href: "/agents",
      complete: hasSyncedAgent,
    },
    {
      id: "register_number",
      title: "Register your Twilio number",
      description:
        "Add the Twilio number you want the agent to answer on. You'll need its Number SID.",
      href: "/phone-numbers",
      complete: hasNumber,
    },
    {
      id: "assign_number",
      title: "Point the number at an agent",
      description:
        "Assign the number to the agent that should answer it, so inbound calls route correctly.",
      href: "/phone-numbers",
      complete: hasAssignedNumber,
    },
    {
      id: "test_call",
      title: "Place a test call",
      description:
        "Call the number from any phone. The transcript and call outcome appear under Calls.",
      href: "/calls",
      complete: hasCall,
    },
  ];

  const completedCount = steps.filter((step) => step.complete).length;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    isComplete: completedCount === steps.length,
  };
}
