"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleCalendarIntegrations } from "@/db/schema";
import { requireCurrentContext } from "@/server/auth/current-user";

export async function disconnectGoogleCalendar(): Promise<void> {
  const { organizationId } = await requireCurrentContext(["owner", "admin"]);
  await db
    .delete(googleCalendarIntegrations)
    .where(eq(googleCalendarIntegrations.organizationId, organizationId));
  revalidatePath("/settings");
}
