import Link from "next/link";
import type { OnboardingStatus } from "@/server/services/onboarding.service";

/**
 * First-run onboarding checklist.
 *
 * The steps are DERIVED from the workspace's real state (see
 * server/services/onboarding.service.ts), not from a stored
 * "step number", so this panel can never tell someone to redo
 * something they have already done.
 *
 * Once every step is complete the panel is not rendered at all — a
 * finished checklist is just noise on the dashboard.
 */
export function OnboardingChecklist({ status }: { status: OnboardingStatus }) {
  if (status.isComplete) {
    return null;
  }

  const nextStep = status.steps.find((step) => !step.complete);

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="onboarding-heading"
              className="text-base font-semibold text-foreground"
            >
              Set up your first agent
            </h2>
            <p className="mt-1 text-sm text-muted">
              {status.completedCount} of {status.totalCount} steps done
              {nextStep ? ` — next: ${nextStep.title.toLowerCase()}.` : "."}
            </p>
          </div>
          {nextStep && (
            <Link
              href={nextStep.href}
              className="inline-flex w-fit items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Continue setup
            </Link>
          )}
        </div>

        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]"
          role="progressbar"
          aria-valuenow={status.completedCount}
          aria-valuemin={0}
          aria-valuemax={status.totalCount}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{
              width: `${(status.completedCount / status.totalCount) * 100}%`,
            }}
          />
        </div>
      </div>

      <ol className="divide-y divide-border">
        {status.steps.map((step) => (
          <li key={step.id} className="flex gap-3 px-6 py-4">
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                step.complete
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {step.complete ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  step.complete ? "text-muted" : "text-foreground"
                }`}
              >
                {step.title}
                {step.complete && (
                  <span className="ml-2 text-xs font-normal text-muted">
                    Done
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-muted">{step.description}</p>
            </div>
            {!step.complete && (
              <Link
                href={step.href}
                className="shrink-0 self-center text-sm font-medium text-accent hover:underline"
              >
                Do it
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
