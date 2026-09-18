import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { customers } from "@/db/schema";
import type { Customer } from "@/db/schema";
import { isUniqueViolation } from "@/server/db-errors";

/**
 * Not a real CRM — a minimal customer record scoped to one organization.
 * See db/schema.ts for the Phase 1.1 scope note.
 */
export async function findCustomerByPhone(
  db: Database,
  params: { organizationId: string; phone: string },
): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, params.organizationId), eq(customers.phone, params.phone)))
    .limit(1);
  return customer ?? null;
}

export async function findCustomerById(
  db: Database,
  params: { organizationId: string; customerId: string },
): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, params.customerId), eq(customers.organizationId, params.organizationId)))
    .limit(1);
  return customer ?? null;
}

export interface UpsertCustomerParams {
  organizationId: string;
  name: string;
  phone: string;
  email?: string;
}

/**
 * Idempotent by design: an agent may call "create a customer" more than
 * once for the same caller across a conversation (or across retries) —
 * treating an existing (organizationId, phone) as "already have them"
 * rather than a conflict error keeps the tool safe to call defensively.
 */
export async function upsertCustomer(
  db: Database,
  params: UpsertCustomerParams,
): Promise<{ customer: Customer; created: boolean }> {
  try {
    const [customer] = await db
      .insert(customers)
      .values({
        organizationId: params.organizationId,
        name: params.name,
        phone: params.phone,
        email: params.email,
      })
      .returning();
    return { customer, created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findCustomerByPhone(db, {
        organizationId: params.organizationId,
        phone: params.phone,
      });
      if (existing) return { customer: existing, created: false };
    }
    throw error;
  }
}
