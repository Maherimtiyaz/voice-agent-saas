import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { customers } from "@/db/schema";
import type { Customer } from "@/db/schema";
import { isUniqueViolation } from "@/server/db-errors";
import {
  findHubSpotContactByPhoneIfConnected,
  syncHubSpotContactIfConnected,
} from "@/server/integrations/hubspot/client";

export async function findCustomerByPhone(
  db: Database,
  params: { organizationId: string; phone: string },
): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, params.organizationId), eq(customers.phone, params.phone)))
    .limit(1);
  if (customer) return customer;

  const hubspotContact = await findHubSpotContactByPhoneIfConnected(db, params);
  if (!hubspotContact) return null;
  const firstName = hubspotContact.properties?.firstname?.trim() ?? "";
  const lastName = hubspotContact.properties?.lastname?.trim() ?? "";
  const [createdCustomer] = await db
    .insert(customers)
    .values({
      organizationId: params.organizationId,
      name: [firstName, lastName].filter(Boolean).join(" ") || params.phone,
      phone: params.phone,
      email: hubspotContact.properties?.email || undefined,
      hubspotContactId: hubspotContact.id,
    })
    .onConflictDoNothing({
      target: [customers.organizationId, customers.phone],
    })
    .returning();
  if (createdCustomer) return createdCustomer;

  const [customerCreatedConcurrently] = await db
    .select()
    .from(customers)
    .where(and(
      eq(customers.organizationId, params.organizationId),
      eq(customers.phone, params.phone),
    ))
    .limit(1);
  return customerCreatedConcurrently ?? null;
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

export async function syncCustomerToHubSpot(
  db: Database,
  customer: Customer,
): Promise<Customer> {
  const hubspotContactId = await syncHubSpotContactIfConnected(db, {
    organizationId: customer.organizationId,
    hubspotContactId: customer.hubspotContactId,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
  });
  if (!hubspotContactId || hubspotContactId === customer.hubspotContactId) {
    return customer;
  }

  const [updatedCustomer] = await db
    .update(customers)
    .set({ hubspotContactId, updatedAt: new Date() })
    .where(and(
      eq(customers.id, customer.id),
      eq(customers.organizationId, customer.organizationId),
    ))
    .returning();
  return updatedCustomer;
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
  let customer: Customer;
  let created: boolean;
  try {
    const [insertedCustomer] = await db
      .insert(customers)
      .values({
        organizationId: params.organizationId,
        name: params.name,
        phone: params.phone,
        email: params.email,
      })
      .returning();
    customer = insertedCustomer;
    created = true;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findCustomerByPhone(db, {
        organizationId: params.organizationId,
        phone: params.phone,
      });
      if (existing) {
        customer = existing;
        created = false;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  return { customer: await syncCustomerToHubSpot(db, customer), created };
}
