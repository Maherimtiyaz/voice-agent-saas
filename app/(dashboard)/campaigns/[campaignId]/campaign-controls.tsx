"use client";

import { useActionState } from "react";
import {
  pauseCampaignAction,
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

  return (
    <div className="flex flex-col gap-3">
      {campaign.status !== "completed" && (
        <div className="flex flex-wrap gap-3">
          {campaign.activeContactId ? (
            <p className="self-center text-sm text-muted">
              A call is in progress. Wait for it to finish before dispatching another.
            </p>
          ) : (
            <form action={startAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" disabled={startPending}>
                {startPending ? "Starting…" : campaign.status === "active" ? "Call next contact" : "Start campaign"}
              </Button>
            </form>
          )}
          {campaign.status === "active" && (
            <form action={pauseAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" variant="secondary" disabled={pausePending}>
                {pausePending ? "Pausing…" : "Pause campaign"}
              </Button>
            </form>
          )}
        </div>
      )}
      {startState?.message && (
        <p className={`text-sm ${startState.success ? "text-accent" : "text-danger"}`}>
          {startState.message}
        </p>
      )}
      {pauseState?.message && (
        <p className={`text-sm ${pauseState.success ? "text-accent" : "text-danger"}`}>
          {pauseState.message}
        </p>
      )}
    </div>
  );
}
