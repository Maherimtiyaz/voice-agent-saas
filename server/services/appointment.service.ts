import { and, eq, gte, lt } from "drizzle-orm";
import type { Database } from "@/db";
import { appointments } from "@/db/schema";
import type { Appointment } from "@/db/schema";

/**
 * NOT a real calendar integration — there is no Google Calendar/Outlook
 * sync. Availability is computed against our own `appointments` table on
 * a fixed, hardcoded business-hours schedule shared across the whole
 * organization (not per-agent). This is a deliberately simple stand-in
 * so the tool framework has something real to check against; replacing
 * it with an actual calendar provider is future work, not Phase 1.1.
 */
const BUSINESS_HOURS_START = 9; // 9am
const BUSINESS_HOURS_END = 17; // 5pm
const SLOT_MINUTES = 30;

function startOfDayUtc(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function candidateSlots(dateOnly: string, durationMinutes: number): Date[] {
  const day = startOfDayUtc(dateOnly);
  const slots: Date[] = [];
  const lastPossibleStartMinutes = BUSINESS_HOURS_END * 60 - durationMinutes;

  for (
    let minutes = BUSINESS_HOURS_START * 60;
    minutes <= lastPossibleStartMinutes;
    minutes += SLOT_MINUTES
  ) {
    slots.push(new Date(day.getTime() + minutes * 60_000));
  }
  return slots;
}

async function overlappingAppointments(
  db: Database,
  params: { organizationId: string; dateOnly: string },
): Promise<Appointment[]> {
  const dayStart = startOfDayUtc(params.dateOnly);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.organizationId, params.organizationId),
        eq(appointments.status, "scheduled"),
        gte(appointments.scheduledAt, dayStart),
        lt(appointments.scheduledAt, dayEnd),
      ),
    );
}

function slotsOverlap(
  aStart: Date,
  aDurationMinutes: number,
  bStart: Date,
  bDurationMinutes: number,
): boolean {
  const aEnd = aStart.getTime() + aDurationMinutes * 60_000;
  const bEnd = bStart.getTime() + bDurationMinutes * 60_000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

export async function getAvailableSlots(
  db: Database,
  params: { organizationId: string; dateOnly: string; durationMinutes: number },
): Promise<Date[]> {
  const booked = await overlappingAppointments(db, {
    organizationId: params.organizationId,
    dateOnly: params.dateOnly,
  });

  return candidateSlots(params.dateOnly, params.durationMinutes).filter(
    (slot) =>
      !booked.some((appointment) =>
        slotsOverlap(slot, params.durationMinutes, appointment.scheduledAt, appointment.durationMinutes),
      ),
  );
}

export interface BookAppointmentParams {
  organizationId: string;
  agentId: string;
  callId: string;
  customerId: string;
  scheduledAt: Date;
  durationMinutes: number;
  notes?: string;
}

export type BookAppointmentResult =
  | { booked: true; appointment: Appointment }
  | { booked: false; reason: "slot_unavailable" };

export async function bookAppointment(
  db: Database,
  params: BookAppointmentParams,
): Promise<BookAppointmentResult> {
  const dateOnly = params.scheduledAt.toISOString().slice(0, 10);
  const booked = await overlappingAppointments(db, {
    organizationId: params.organizationId,
    dateOnly,
  });

  const conflict = booked.some((appointment) =>
    slotsOverlap(
      params.scheduledAt,
      params.durationMinutes,
      appointment.scheduledAt,
      appointment.durationMinutes,
    ),
  );
  // Not fully race-free without a DB-level exclusion constraint — two
  // concurrent bookings for the same slot could both pass this check.
  // Acceptable for Phase 1.1's scope; a unique/exclusion constraint on
  // (organization_id, scheduled_at) ranges is the natural next hardening
  // step if double-booking shows up in practice.
  if (conflict) {
    return { booked: false, reason: "slot_unavailable" };
  }

  const [appointment] = await db
    .insert(appointments)
    .values({
      organizationId: params.organizationId,
      customerId: params.customerId,
      agentId: params.agentId,
      callId: params.callId,
      scheduledAt: params.scheduledAt,
      durationMinutes: params.durationMinutes,
      notes: params.notes,
    })
    .returning();

  return { booked: true, appointment };
}
