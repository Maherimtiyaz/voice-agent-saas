import { logoutAction } from "@/app/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import type { OrganizationMembership } from "@/server/services/organization.service";

export function Topbar({
  userEmail,
  organizations,
  activeOrganizationId,
}: {
  userEmail: string;
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-8 py-4">
      <WorkspaceSwitcher
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
      />
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted">{userEmail}</span>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
