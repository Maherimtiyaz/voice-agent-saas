import { logoutAction } from "@/app/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { MobileNav } from "@/components/dashboard/mobile-nav";
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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-xl sm:px-8 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav />
        <WorkspaceSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
        />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-sm text-muted md:inline">{userEmail}</span>
        <ThemeToggle />
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" className="rounded-full">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
