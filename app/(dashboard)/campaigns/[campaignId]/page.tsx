import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import type { CampaignContactStatus, CampaignStatus } from "@/db/schema";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { NotFoundError } from "@/server/errors";
import { getCampaignDetails } from "@/server/services/campaign.service";
import { AddContactsForm } from "./add-contacts-form";
import { CampaignControls } from "./campaign-controls";

export const metadata: Metadata = { title: "Campaign" };

const CAMPAIGN_STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-black/[0.06] text-foreground",
  active: "bg-accent/10 text-accent",
  paused: "bg-black/[0.06] text-muted",
  completed: "bg-black/[0.06] text-muted",
};

const CONTACT_STATUS_STYLES: Record<CampaignContactStatus, string> = {
  pending: "text-muted",
  calling: "text-accent",
  completed: "text-accent",
  failed: "text-danger",
  no_answer: "text-muted",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const { user, organizationId } = await requireCurrentContext();
  let details;
  try {
    details = await getCampaignDetails(db, {
      organizationId,
      userId: user.id,
      campaignId,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { campaign, contacts } = details;
  const canAddContacts =
    (campaign.status === "draft" || campaign.status === "paused") &&
    campaign.activeContactId === null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/campaigns" className="text-sm text-muted hover:text-foreground">
          ← Campaigns
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${CAMPAIGN_STATUS_STYLES[campaign.status]}`}>
            {campaign.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Agent: {details.agentName} · Caller ID: {details.phoneNumberE164}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call controls</CardTitle>
          <CardDescription>
            Dispatches one contact at a time. A call already in progress is not interrupted by pausing.
          </CardDescription>
        </CardHeader>
        <CampaignControls campaign={campaign} />
      </Card>

      {canAddContacts && (
        <Card>
          <CardHeader>
            <CardTitle>Add contacts</CardTitle>
            <CardDescription>
              Only add numbers that have consented to be called by your organization.
            </CardDescription>
          </CardHeader>
          <AddContactsForm campaignId={campaign.id} />
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contacts ({contacts.length})</CardTitle>
          <CardDescription>
            Consent is recorded at import. Each number can appear only once in this campaign.
          </CardDescription>
        </CardHeader>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted">No contacts have been added.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Phone number</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Consent confirmed</th>
                  <th className="px-4 py-2 font-medium">Confirmed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-4 py-2 font-mono text-xs text-foreground">
                      {contact.phoneNumber}
                    </td>
                    <td className={`px-4 py-2 capitalize ${CONTACT_STATUS_STYLES[contact.status]}`}>
                      {contact.status.replace("_", " ")}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {contact.consentConfirmedAt.toISOString().slice(0, 10)} UTC
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">
                      {contact.consentConfirmedByUserId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
