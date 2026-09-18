import type { Metadata } from "next";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import {
  getOrganization,
  listOrganizationMembers,
} from "@/server/services/organization.service";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { user, organizationId } = await requireCurrentContext();
  const [organization, members] = await Promise.all([
    getOrganization(db, { organizationId, userId: user.id }),
    listOrganizationMembers(db, { organizationId, userId: user.id }),
  ]);

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
