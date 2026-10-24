import "server-only";
import { desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { demoRequests } from "@/db/schema";
import type { DemoRequest, DemoRequestStatus } from "@/db/schema";
import { ConflictError } from "@/server/errors";

/**
 * Leads from the public landing-page form.
 *
 * This is intentionally NOT part of the tenant model: a demo request
 * has no `organization_id`, no `user_id`, and no workspace. It is a
 * stranger who filled in a public form, so the only write path is
 * this module, and it never accepts an organization or user id from
 * the caller.
 */

export interface DemoRequestInput {
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  useCase?: string | null;
  callVolume?: string | null;
  message?: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Records a lead.
 *
 * The email is unique, and re-submitting an email that already exists
 * UPDATES the existing row rather than failing. From the visitor's
 * point of view the form worked; from ours, we have one row per person
 * and the most recent details. A duplicate insert that loses a race
 * (two submissions at the same instant) is caught and treated as an
 * update rather than surfacing an error to the visitor.
 */
export async function createDemoRequest(
  db: Database,
  input: DemoRequestInput,
): Promise<DemoRequest> {
  const email = normalizeEmail(input.email);
  const values = {
    name: input.name.trim(),
    email,
    company: input.company?.trim() || null,
    phone: input.phone?.trim() || null,
    useCase: input.useCase?.trim() || null,
    callVolume: input.callVolume?.trim() || null,
    message: input.message?.trim() || null,
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(demoRequests)
    .set(values)
    .where(eq(demoRequests.email, email))
    .returning();

  if (updated) return updated;

  try {
    const [created] = await db.insert(demoRequests).values(values).returning();
    return created;
  } catch (error) {
    // A concurrent submission for the same email won the race. Fall
    // back to updating that row so the visitor still gets a success.
    const [raced] = await db
      .update(demoRequests)
      .set(values)
      .where(eq(demoRequests.email, email))
      .returning();
    if (raced) return raced;
    throw error;
  }
}

export interface ListDemoRequestsParams {
  status?: DemoRequestStatus;
  limit?: number;
}

/** Leads for the team, newest first. */
export async function listDemoRequests(
  db: Database,
  params: ListDemoRequestsParams = {},
): Promise<DemoRequest[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);

  return db
    .select()
    .from(demoRequests)
    .where(params.status ? eq(demoRequests.status, params.status) : undefined)
    .orderBy(desc(demoRequests.createdAt))
    .limit(limit);
}

export async function countDemoRequests(
  db: Database,
  params: { status?: DemoRequestStatus } = {},
): Promise<number> {
  const rows = await db
    .select()
    .from(demoRequests)
    .where(
      params.status ? eq(demoRequests.status, params.status) : undefined,
    );
  return rows.length;
}

export async function updateDemoRequestStatus(
  db: Database,
  params: { id: string; status: DemoRequestStatus },
): Promise<DemoRequest> {
  const [updated] = await db
    .update(demoRequests)
    .set({ status: params.status, updatedAt: new Date() })
    .where(eq(demoRequests.id, params.id))
    .returning();

  if (!updated) {
    throw new ConflictError("That demo request no longer exists.");
  }
  return updated;
}
