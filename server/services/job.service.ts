import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { appointments, jobs } from "@/db/schema";
import type { Job } from "@/db/schema";

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

  return { created: true, job };
}
