"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hubspotIntegrations } from "@/db/schema";
import { requireCurrentContext } from "@/server/auth/current-user";

export async function disconnectHubSpot(): Promise<void> {
  const { organizationId } = await requireCurrentContext(["owner", "admin"]);
  await db
    .delete(hubspotIntegrations)
    .where(eq(hubspotIntegrations.organizationId, organizationId));
  revalidatePath("/settings");
}
