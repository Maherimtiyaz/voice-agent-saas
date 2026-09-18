import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Phase 0 schema.
 *
 * Users are global identities. An `organization` is a tenant/workspace.
 * `organizationMembers` is the join table that lets one user belong to
 * more than one organization with a role scoped to that organization —
 * this is what workspace switching is built on.
 *
 * `agents` stores the shape the product will eventually need
 * (name, description, system prompt, voice config, language, status),
 * but Phase 0 only ever writes `name` and `status` — the rest are
 * nullable and unused until Vapi/Twilio wiring lands in a later phase.
 * No provider ids (Twilio number SID, Vapi assistant id) exist yet;
 * those are added when that integration is actually built, not before.
 */

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "member",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "draft",
  "active",
  "disabled",
]);

export const phoneNumberStatusEnum = pgEnum("phone_number_status", [
  "active",
  "inactive",
]);

export const callStatusEnum = pgEnum("call_status", [
  "ringing",
  "in_progress",
  "completed",
  "failed",
  "no_answer",
  "voicemail",
]);

export const transcriptRoleEnum = pgEnum("transcript_role", [
  "user",
  "assistant",
  "system",
]);

export const webhookProviderEnum = pgEnum("webhook_provider", [
  "twilio",
  "vapi",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "completed",
  "cancelled",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);

export const toolExecutionStatusEnum = pgEnum("tool_execution_status", [
  "success",
  "failure",
]);

/**
 * A business outcome, distinct from `calls.status` (lifecycle state).
 * Set by the tool executor when a tool handler's result declares one
 * (see server/tools/types.ts ToolResult.outcome and
 * server/tools/executor.ts) — never inferred from `calls.status` or
 * `ended_reason`. If more than one outcome-bearing tool succeeds on the
 * same call (e.g. book_appointment then create_job), the LAST one to
 * succeed wins; this is a single best-summary field for the call list,
 * not a full history — the full history is `tool_executions`.
 */
export const callOutcomeEnum = pgEnum("call_outcome", [
  "appointment_booked",
  "job_created",
  "transferred_to_human",
  "sms_sent",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  slugUnique: uniqueIndex("organizations_slug_unique").on(table.slug),
}));

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: memberRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  orgUserUnique: uniqueIndex("organization_members_org_user_unique").on(
    table.organizationId,
    table.userId,
  ),
}));

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Nullable / unused by the UI in Phase 0 — see file header.
  description: text("description"),
  systemPrompt: text("system_prompt"),
  voiceConfig: jsonb("voice_config").$type<Record<string, unknown>>(),
  language: text("language").notNull().default("en"),
  status: agentStatusEnum("status").notNull().default("draft"),
  // Set once the agent has been synced to Vapi as an assistant (Phase 1).
  // Null until then — sync is an explicit, manually-triggered action, not
  // automatic on every create/update (see server/integrations/vapi).
  vapiAssistantId: text("vapi_assistant_id"),
  // Pre-approved live-transfer destination (Phase 1.1 tool framework).
  // Deliberately NOT settable by the LLM at call time — see
  // server/tools/definitions/transfer-call.ts. Null means transfers are
  // disabled for this agent.
  transferNumber: text("transfer_number"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Phase 1: inbound voice calling.
 *
 * A phone number is a real Twilio number the organization owns, manually
 * registered here (buying/configuring the number itself happens in the
 * Twilio console — see README "Manual setup required"). Its Voice webhook
 * must point at /api/voice/twilio/inbound in this app. `agentId` is
 * nullable: a number can be registered before it's assigned to an agent,
 * and the inbound webhook handler treats "no agent assigned" as a normal,
 * gracefully-handled case rather than an error.
 */
export const phoneNumbers = pgTable("phone_numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  twilioNumberSid: text("twilio_number_sid").notNull(),
  e164Number: text("e164_number").notNull(),
  // The Vapi phone-number record id this Twilio number was imported as
  // (Vapi dashboard: "Import number from Twilio" — see README). Required
  // by Vapi's phone-call-bypass API even when Vapi isn't managing the
  // Twilio webhook itself; nullable here only until that manual import
  // step has been done for this number.
  vapiPhoneNumberId: text("vapi_phone_number_id"),
  status: phoneNumberStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  twilioSidUnique: uniqueIndex("phone_numbers_twilio_sid_unique").on(
    table.twilioNumberSid,
  ),
  e164Unique: uniqueIndex("phone_numbers_e164_unique").on(table.e164Number),
}));

/**
 * One row per phone call. Created the moment an inbound Twilio call is
 * matched to a phone number + agent (see app/api/voice/twilio/inbound);
 * updated as Vapi's status-update / end-of-call-report events arrive
 * (see app/api/voice/vapi/events). `status` is call-lifecycle state only
 * (queued/ringing/in-progress/ended-with-a-reason) — the business
 * outcome (an appointment got booked, a job got created, ...) lives in
 * the separate `outcome` column, set by the tool executor, never
 * conflated with `status`.
 */
export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  phoneNumberId: uuid("phone_number_id")
    .notNull()
    .references(() => phoneNumbers.id, { onDelete: "cascade" }),
  twilioCallSid: text("twilio_call_sid").notNull(),
  vapiCallId: text("vapi_call_id"),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  status: callStatusEnum("status").notNull().default("ringing"),
  endedReason: text("ended_reason"),
  outcome: callOutcomeEnum("outcome"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  twilioSidUnique: uniqueIndex("calls_twilio_call_sid_unique").on(
    table.twilioCallSid,
  ),
  vapiCallIdUnique: uniqueIndex("calls_vapi_call_id_unique").on(table.vapiCallId),
  orgIdx: index("calls_organization_id_idx").on(table.organizationId),
}));

/**
 * Individual transcript lines for a call. `sequenceNumber` is assigned by
 * US (not by the provider) to preserve display order regardless of
 * webhook delivery/retry order. Only "final" transcript chunks are
 * persisted as user/assistant rows (partial chunks are noise, filtered in
 * the webhook handler) — see server/services/call.service.ts.
 */
export const callTranscripts = pgTable("call_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id")
    .notNull()
    .references(() => calls.id, { onDelete: "cascade" }),
  role: transcriptRoleEnum("role").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  sequenceNumber: integer("sequence_number").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  callSequenceUnique: uniqueIndex("call_transcripts_call_sequence_unique").on(
    table.callId,
    table.sequenceNumber,
  ),
}));

/**
 * Idempotency ledger for provider webhooks. `externalEventId` is not
 * something either provider hands us directly (neither Twilio's nor
 * Vapi's inbound-call/event payloads include a stable, documented event
 * id) — it's a dedupe key WE derive per provider in the webhook route
 * (Twilio: the CallSid; Vapi: call id + message type + a content hash,
 * since Vapi can resend the exact same message). See the webhook routes
 * under app/api/voice/ for exactly how each is built.
 */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: webhookProviderEnum("provider").notNull(),
  externalEventId: text("external_event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  providerEventUnique: uniqueIndex("webhook_events_provider_event_unique").on(
    table.provider,
    table.externalEventId,
  ),
}));

/**
 * Phase 1.1: the agent tool framework's data model.
 *
 * These back a small, generic set of demo tools (get/create customer,
 * check availability, book appointment, create job) — NOT a real CRM or
 * calendar integration. `check_availability` works against `appointments`
 * rows in this same table, on a fixed hardcoded business-hours schedule
 * (see server/tools/definitions/check-availability.ts); there is no
 * Google Calendar / Outlook sync. `jobs` is an internal record only, not
 * a connection to any external job-management system.
 */
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  orgPhoneUnique: uniqueIndex("customers_organization_phone_unique").on(
    table.organizationId,
    table.phone,
  ),
}));

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  status: appointmentStatusEnum("status").notNull().default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  orgIdx: index("appointments_organization_id_idx").on(table.organizationId),
}));

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").references(() => appointments.id, {
    onDelete: "set null",
  }),
  description: text("description").notNull(),
  status: jobStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  orgIdx: index("jobs_organization_id_idx").on(table.organizationId),
}));

/**
 * Execution ledger for every tool call an agent makes, successful or
 * not — this is what "log execution" means in practice: every row here
 * is one LLM-initiated tool invocation, with what it was given, what it
 * got back (or the error), and how long it took. `callId` is nullable
 * only because the executor is technically callable outside a live call
 * (e.g. future testing tools); in the actual webhook path it's always set.
 */
export const toolExecutions = pgTable("tool_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  callId: uuid("call_id").references(() => calls.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  status: toolExecutionStatusEnum("status").notNull(),
  error: text("error"),
  durationMs: integer("duration_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  callIdx: index("tool_executions_call_id_idx").on(table.callId),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  agents: many(agents),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMembers),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
  }),
);

export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id],
  }),
  phoneNumbers: many(phoneNumbers),
  calls: many(calls),
}));

export const phoneNumbersRelations = relations(phoneNumbers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [phoneNumbers.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [phoneNumbers.agentId],
    references: [agents.id],
  }),
  calls: many(calls),
}));

export const callsRelations = relations(calls, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [calls.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [calls.agentId],
    references: [agents.id],
  }),
  phoneNumber: one(phoneNumbers, {
    fields: [calls.phoneNumberId],
    references: [phoneNumbers.id],
  }),
  transcripts: many(callTranscripts),
}));

export const callTranscriptsRelations = relations(callTranscripts, ({ one }) => ({
  call: one(calls, {
    fields: [callTranscripts.callId],
    references: [calls.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [customers.organizationId],
    references: [organizations.id],
  }),
  appointments: many(appointments),
  jobs: many(jobs),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  organization: one(organizations, {
    fields: [appointments.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, {
    fields: [appointments.customerId],
    references: [customers.id],
  }),
  agent: one(agents, {
    fields: [appointments.agentId],
    references: [agents.id],
  }),
  call: one(calls, {
    fields: [appointments.callId],
    references: [calls.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, {
    fields: [jobs.customerId],
    references: [customers.id],
  }),
  appointment: one(appointments, {
    fields: [jobs.appointmentId],
    references: [appointments.id],
  }),
}));

export const toolExecutionsRelations = relations(toolExecutions, ({ one }) => ({
  organization: one(organizations, {
    fields: [toolExecutions.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [toolExecutions.agentId],
    references: [agents.id],
  }),
  call: one(calls, {
    fields: [toolExecutions.callId],
    references: [calls.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type NewPhoneNumber = typeof phoneNumbers.$inferInsert;
export type Call = typeof calls.$inferSelect;
export type NewCall = typeof calls.$inferInsert;
export type CallTranscript = typeof callTranscripts.$inferSelect;
export type NewCallTranscript = typeof callTranscripts.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type ToolExecution = typeof toolExecutions.$inferSelect;
export type NewToolExecution = typeof toolExecutions.$inferInsert;
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type AgentStatus = (typeof agentStatusEnum.enumValues)[number];
export type PhoneNumberStatus = (typeof phoneNumberStatusEnum.enumValues)[number];
export type CallStatus = (typeof callStatusEnum.enumValues)[number];
export type CallOutcome = (typeof callOutcomeEnum.enumValues)[number];
export type TranscriptRole = (typeof transcriptRoleEnum.enumValues)[number];
export type WebhookProvider = (typeof webhookProviderEnum.enumValues)[number];
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type ToolExecutionStatus = (typeof toolExecutionStatusEnum.enumValues)[number];
