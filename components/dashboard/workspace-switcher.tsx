"use client";

import { useRef } from "react";
import { switchOrganizationAction } from "@/app/actions/organization.actions";
import type { OrganizationMembership } from "@/server/services/organization.service";

export function WorkspaceSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (organizations.length <= 1) {
    const only = organizations[0];
    return (
      <span className="text-sm font-medium text-foreground">
        {only?.organizationName ?? "Workspace"}
      </span>
    );
  }

  return (
    <form ref={formRef} action={switchOrganizationAction}>
      <select
        name="organizationId"
        defaultValue={activeOrganizationId}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-medium text-foreground"
        aria-label="Switch workspace"
      >
        {organizations.map((org) => (
          <option key={org.organizationId} value={org.organizationId}>
            {org.organizationName}
          </option>
        ))}
      </select>
    </form>
  );
}
