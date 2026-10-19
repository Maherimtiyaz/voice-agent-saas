import type { Metadata } from "next";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { googleCalendarIntegrations } from "@/db/schema";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentContext } from "@/server/auth/current-user";
import {
  disconnectHubSpot,
} from "@/app/actions/hubspot.actions";
import {
  getOrganization,
  listOrganizationMembers,
} from "@/server/services/organization.service";
import { disconnectGoogleCalendar } from "@/app/actions/calendar.actions";
import { getHubSpotConnectionStatus } from "@/server/integrations/hubspot/client";
import { listApiKeys } from "@/server/services/api-key.service";
import { ApiKeyManagement } from "./api-key-management";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ crm?: string; calendar?: string }>;
}) {
  const { user, organizationId, role } = await requireCurrentContext();
  const [
    { crm },
    organization,
    members,
    calendarConnection,
    hubspotConnection,
    apiKeys,
  ] = await Promise.all([
    searchParams,
    getOrganization(db, { organizationId, userId: user.id }),
    listOrganizationMembers(db, { organizationId, userId: user.id }),
    db
      .select({ connectedAt: googleCalendarIntegrations.connectedAt })
      .from(googleCalendarIntegrations)
      .where(eq(googleCalendarIntegrations.organizationId, organizationId))
      .limit(1),
    getHubSpotConnectionStatus(db, organizationId),
    role === "owner" || role === "admin"
      ? listApiKeys(db, { organizationId, userId: user.id })
      : Promise.resolve([]),
  ]);
  const isCalendarConnected = calendarConnection.length > 0;
  const canManageIntegrations = role === "owner" || role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted">Workspace details, access, and integrations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>HubSpot CRM</CardTitle>
          <CardDescription>
            {hubspotConnection
              ? "Connected. Voice agents sync customers as contacts and work orders as associated deals."
              : "Connect HubSpot to sync customers as contacts and work orders as associated deals. Local records continue to work if it is disconnected."}
          </CardDescription>
          {crm === "connected" && (
            <p role="status" className="text-sm text-success">HubSpot connected successfully.</p>
          )}
          {crm === "cancelled" && (
            <p role="status" className="text-sm text-muted">HubSpot connection was cancelled.</p>
          )}
          {crm === "error" && (
            <p role="alert" className="text-sm text-danger">HubSpot could not be connected. Check app configuration and try again.</p>
          )}
        </CardHeader>
        <div className="flex items-center gap-3">
          {hubspotConnection ? (
            <>
              <span className="text-sm font-medium text-foreground">Connected</span>
              {canManageIntegrations && (
                <form action={disconnectHubSpot}>
                  <Button type="submit" variant="secondary">Disconnect</Button>
                </form>
              )}
            </>
          ) : canManageIntegrations ? (
            <a
              href="/api/crm/hubspot/connect"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Connect HubSpot
            </a>
          ) : (
            <span className="text-sm text-muted">An owner or admin must connect HubSpot.</span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>{organization.name}</CardDescription>
        </CardHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Slug</dt>
          <dd className="font-mono text-foreground">{organization.slug}</dd>
          <dt className="text-muted">Created</dt>
          <dd className="text-foreground">
            {organization.createdAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </dd>
        </dl>
      </Card>

      {canManageIntegrations && (
        <Card>
          <CardHeader>
            <CardTitle>Public API keys</CardTitle>
            <CardDescription>
              Workspace API keys grant read-only access to agents, phone numbers,
              calls, and transcripts. Keep keys server-side and revoke any key
              that may have been exposed.
            </CardDescription>
          </CardHeader>
          <ApiKeyManagement apiKeys={apiKeys} />
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>
            {isCalendarConnected
              ? "Connected. Appointment availability checks use this calendar, and confirmed bookings are added to it."
              : "Connect a workspace calendar to check real availability and add booked appointments."}
          </CardDescription>
        </CardHeader>
        <div className="flex items-center gap-3">
          {isCalendarConnected ? (
            <>
              <span className="text-sm font-medium text-foreground">Connected to primary calendar</span>
              {canManageIntegrations && (
                <form action={disconnectGoogleCalendar}>
                  <Button type="submit" variant="secondary">Disconnect</Button>
                </form>
              )}
            </>
          ) : (
            canManageIntegrations ? (
              <a
                href="/api/calendar/google/connect"
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Connect Google Calendar
              </a>
            ) : (
              <span className="text-sm text-muted">An owner or admin must connect Google Calendar.</span>
            )
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"} in this workspace.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col divide-y divide-border">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{member.name}</p>
                <p className="text-sm text-muted">{member.email}</p>
              </div>
              <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-xs font-medium capitalize text-foreground">
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
