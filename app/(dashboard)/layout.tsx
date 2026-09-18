import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import {
  getActiveOrganizationId,
  getCurrentUserOrganizations,
  requireCurrentUser,
} from "@/server/auth/current-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  const organizationId = await getActiveOrganizationId();

  if (!organizationId) {
    redirect("/login");
  }

  const organizations = await getCurrentUserOrganizations(user.id);
  const activeOrganization = organizations.find(
    (org) => org.organizationId === organizationId,
  );

  // The session points at an org the user is no longer a member of
  // (removed, or a stale cookie) — bounce to login rather than render
  // a dashboard with no valid tenant context.
  if (!activeOrganization) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar
          userEmail={user.email}
          organizations={organizations}
          activeOrganizationId={organizationId}
        />
        <main className="flex-1 bg-background px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
