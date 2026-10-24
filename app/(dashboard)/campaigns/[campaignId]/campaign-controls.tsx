"use client";

import { useActionState } from "react";
import {
  pauseCampaignAction,
  resumeCampaignAction,
  startCampaignCallAction,
} from "@/app/actions/campaign.actions";
import { Button } from "@/components/ui/button";
import type { Campaign } from "@/db/schema";

export function CampaignControls({ campaign }: { campaign: Campaign }) {
  const [startState, startAction, startPending] = useActionState(
    startCampaignCallAction,
    undefined,
  );
  const [pauseState, pauseAction, pausePending] = useActionState(
    pauseCampaignAction,
    undefined,
  );
  const [resumeState, resumeAction, resumePending] = useActionState(
    resumeCampaignAction,
    undefined,
  );

  const startMessage = startState?.message;
  const pauseMessage = pauseState?.message;
  const resumeMessage = resumeState?.message;

  return (
    <div className="flex flex-col gap-3">
      {campaign.status !== "completed" && (
        <div className="flex flex-wrap gap-3">
          {campaign.activeContactId ? (
            <p className="self-center text-sm text-muted">
              A call is in progress. Wait for it to finish before dispatching another.
            </p>
          ) : campaign.status === "paused" ? (
            <form action={resumeAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" disabled={resumePending}>
                {resumePending ? "Resuming…" : "Resume campaign"}
              </Button>
            </form>
          ) : (
            <form action={startAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" disabled={startPending}>
                {startPending
                  ? "Starting…"
                  : campaign.status === "draft"
                    ? "Start campaign"
                    : "Call next contact"}
              </Button>
            </form>
          )}
          {campaign.status === "active" && !campaign.activeContactId && (
            <form action={pauseAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" variant="secondary" disabled={pausePending}>
                {pausePending ? "Pausing…" : "Pause campaign"}
              </Button>
            </form>
          )}
        </div>
      )}
      {startMessage && (
        <p className={`text-sm ${startState?.success ? "text-accent" : "text-danger"}`}>
          {startMessage}
        </p>
      )}
      {pauseMessage && (
        <p className={`text-sm ${pauseState?.success ? "text-accent" : "text-danger"}`}>
          {pauseMessage}
        </p>
      )}
      {resumeMessage && (
        <p className={`text-sm ${resumeState?.success ? "text-accent" : "text-danger"}`}>
          {resumeMessage}
        </p>
      )}
    </div>
  );
}
