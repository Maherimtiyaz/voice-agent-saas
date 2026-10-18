import type { Metadata } from "next";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { googleCalendarIntegrations } from "@/db/schema";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentContext } from "@/server/auth/current-user";
import {
  getOrganization,
  listOrganizationMembers,
} from "@/server/services/organization.service";
import { disconnectGoogleCalendar } from "@/app/actions/calendar.actions";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { user, organizationId, role } = await requireCurrentContext();
  const [organization, members, calendarConnection] = await Promise.all([
    getOrganization(db, { organizationId, userId: user.id }),
    listOrganizationMembers(db, { organizationId, userId: user.id }),
    db
      .select({ connectedAt: googleCalendarIntegrations.connectedAt })
      .from(googleCalendarIntegrations)
      .where(eq(googleCalendarIntegrations.organizationId, organizationId))
      .limit(1),
  ]);
  const isCalendarConnected = calendarConnection.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted">Workspace details and members.</p>
      </div>

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
              {(role === "owner" || role === "admin") && (
                <form action={disconnectGoogleCalendar}>
                  <Button type="submit" variant="secondary">Disconnect</Button>
                </form>
              )}
            </>
          ) : (
            role === "owner" || role === "admin" ? (
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
