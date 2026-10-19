import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/db";
import type { CampaignStatus } from "@/db/schema";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { listAgents } from "@/server/services/agent.service";
import { listCampaigns } from "@/server/services/campaign.service";
import { listPhoneNumbers } from "@/server/services/phone-number.service";
import { CreateCampaignForm } from "./create-campaign-form";

export const metadata: Metadata = { title: "Campaigns" };

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-black/[0.06] text-foreground",
  active: "bg-accent/10 text-accent",
  paused: "bg-black/[0.06] text-muted",
  completed: "bg-black/[0.06] text-muted",
};

export default async function CampaignsPage() {
  const { user, organizationId } = await requireCurrentContext();
  const [campaigns, agents, phoneNumbers] = await Promise.all([
    listCampaigns(db, { organizationId, userId: user.id }),
    listAgents(db, { organizationId, userId: user.id }),
    listPhoneNumbers(db, { organizationId, userId: user.id }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Outbound campaigns</h1>
        <p className="text-sm text-muted">
          Create a campaign, add consented contacts, then dispatch calls one at a time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New campaign</CardTitle>
          <CardDescription>
            Choose the Vapi agent and registered caller ID this campaign will use.
          </CardDescription>
        </CardHeader>
        <CreateCampaignForm agents={agents} phoneNumbers={phoneNumbers} />
        {(agents.length === 0 || phoneNumbers.length === 0) && (
          <p className="mt-3 text-sm text-muted">
            You can set up the campaign after creating an agent and registering a phone number.
          </p>
        )}
      </Card>

      {campaigns.length === 0 ? (
        <Card className="items-center text-center">
          <CardHeader>
            <CardTitle>No campaigns yet</CardTitle>
            <CardDescription>Create a campaign above to get started.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-black/[0.02] sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{campaign.name}</p>
                <p className="text-xs text-muted">
                  {campaign.contactCount} contact{campaign.contactCount === 1 ? "" : "s"}
                </p>
              </div>
              <span
                className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[campaign.status]}`}
              >
                {campaign.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
