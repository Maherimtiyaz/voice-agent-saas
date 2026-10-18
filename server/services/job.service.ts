import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { appointments, customers, jobs } from "@/db/schema";
import type { Job } from "@/db/schema";
import { createHubSpotDealIfConnected } from "@/server/integrations/hubspot/client";
import { syncCustomerToHubSpot } from "@/server/services/customer.service";

export type CreateJobResult =
  | { created: true; job: Job }
  | { created: false; reason: "appointment_not_found" };

export async function createJob(
  db: Database,
  params: {
    organizationId: string;
    customerId: string;
    description: string;
    appointmentId?: string;
  },
): Promise<CreateJobResult> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(
      eq(customers.id, params.customerId),
      eq(customers.organizationId, params.organizationId),
    ))
    .limit(1);
  if (!customer) {
    throw new Error("Customer not found for this organization.");
  }

  if (params.appointmentId) {
    // The appointment must belong to the SAME organization — this is
    // the same "never trust an id the LLM supplies" rule as everywhere
    // else; an appointmentId from another org must not silently link.
    const [appointment] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.id, params.appointmentId),
          eq(appointments.organizationId, params.organizationId),
        ),
      )
      .limit(1);
    if (!appointment) {
      return { created: false, reason: "appointment_not_found" };
    }
  }

  const [job] = await db
    .insert(jobs)
    .values({
      organizationId: params.organizationId,
      customerId: params.customerId,
      appointmentId: params.appointmentId,
      description: params.description,
    })
    .returning();

  try {
    const syncedCustomer = await syncCustomerToHubSpot(db, customer);
    if (syncedCustomer.hubspotContactId) {
      const hubspotDealId = await createHubSpotDealIfConnected(db, {
        organizationId: params.organizationId,
        contactId: syncedCustomer.hubspotContactId,
        jobId: job.id,
        description: job.description,
      });
      if (hubspotDealId) {
        const [updatedJob] = await db
          .update(jobs)
          .set({ hubspotDealId, updatedAt: new Date() })
          .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, params.organizationId)))
          .returning();
        return { created: true, job: updatedJob };
      }
    }
    return { created: true, job };
  } catch (error) {
    try {
      await db
        .delete(jobs)
        .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, params.organizationId)));
    } catch (cleanupError) {
      console.error("[crm] failed to remove local job after HubSpot sync failed", cleanupError);
    }
    throw error;
  }
}
