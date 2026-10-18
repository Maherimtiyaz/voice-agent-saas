import { and, eq, gte, lt } from "drizzle-orm";
import type { Database } from "@/db";
import { appointments } from "@/db/schema";
import type { Appointment } from "@/db/schema";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarBusyIntervals,
} from "@/server/integrations/google/calendar";

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
  const dayStart = startOfDayUtc(params.dateOnly);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const [booked, calendarBusy] = await Promise.all([
    overlappingAppointments(db, {
      organizationId: params.organizationId,
      dateOnly: params.dateOnly,
    }),
    getGoogleCalendarBusyIntervals(db, {
      organizationId: params.organizationId,
      timeMin: dayStart,
      timeMax: dayEnd,
    }),
  ]);

  return candidateSlots(params.dateOnly, params.durationMinutes).filter(
    (slot) => {
      const overlapsLocalAppointment = booked.some((appointment) =>
        slotsOverlap(slot, params.durationMinutes, appointment.scheduledAt, appointment.durationMinutes),
      );
      const overlapsCalendarEvent = calendarBusy.some((busy) =>
        slot.getTime() < busy.end.getTime()
        && busy.start.getTime() < slot.getTime() + params.durationMinutes * 60_000,
      );
      return !overlapsLocalAppointment && !overlapsCalendarEvent;
    },
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
  const dayStart = startOfDayUtc(dateOnly);
  const calendarBusy = await getGoogleCalendarBusyIntervals(db, {
    organizationId: params.organizationId,
    timeMin: dayStart,
    timeMax: new Date(dayStart.getTime() + 24 * 60 * 60_000),
  });
  const conflictsWithCalendar = calendarBusy.some((busy) =>
    params.scheduledAt.getTime() < busy.end.getTime()
    && busy.start.getTime() < params.scheduledAt.getTime() + params.durationMinutes * 60_000,
  );
  if (conflict || conflictsWithCalendar) {
    return { booked: false, reason: "slot_unavailable" };
  }

  const googleEventId = await createGoogleCalendarEvent(db, {
    organizationId: params.organizationId,
    start: params.scheduledAt,
    durationMinutes: params.durationMinutes,
    description: params.notes,
  });

  try {
    const [appointment] = await db
      .insert(appointments)
      .values({
        organizationId: params.organizationId,
        customerId: params.customerId,
        agentId: params.agentId,
        callId: params.callId,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        googleEventId,
        notes: params.notes,
      })
      .returning();

    return { booked: true, appointment };
  } catch (error) {
    try {
      await deleteGoogleCalendarEvent(db, {
        organizationId: params.organizationId,
        eventId: googleEventId,
      });
    } catch (cleanupError) {
      console.error("[calendar] failed to remove Google event after local booking failed", cleanupError);
    }
    throw error;
  }
}
