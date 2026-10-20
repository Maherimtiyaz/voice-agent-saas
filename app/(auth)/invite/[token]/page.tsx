import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvitationForm } from "@/app/(dashboard)/settings/accept-invitation-form";
import { getCurrentUser } from "@/server/auth/current-user";
import { getOrganizationInviteByToken } from "@/server/services/organization-invite.service";
import { db } from "@/db";
import { RegisterInviteForm } from "./register-invite-form";

export const metadata: Metadata = {
  title: "Join a workspace",
};

export default async function InvitationPage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invite, user] = await Promise.all([
    getOrganizationInviteByToken(db, token),
    getCurrentUser(),
  ]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{invite ? `Join ${invite.organizationName}` : "Invitation unavailable"}</CardTitle>
            <CardDescription>
              {invite
                ? `This workspace invited ${invite.email} as a ${invite.role}.`
                : "This invitation is invalid, expired, revoked, or already accepted."}
            </CardDescription>
          </CardHeader>
          {!invite ? (
            <p className="text-sm text-muted">
              Ask a workspace owner or admin to create a new invitation.
            </p>
          ) : user ? (
            user.email.toLowerCase() === invite.email ? (
              <AcceptInvitationForm token={token} />
            ) : (
              <div className="flex flex-col gap-3">
                <p role="alert" className="text-sm text-danger">
                  You are signed in as {user.email}. Sign in with {invite.email} to accept this invitation.
                </p>
                <Link
                  href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Continue to sign in
                </Link>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Create an account with the invited email address to join this workspace.
              </p>
              <RegisterInviteForm token={token} />
              <p className="text-center text-sm text-muted">
                Already have an account?{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="font-medium text-accent hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
