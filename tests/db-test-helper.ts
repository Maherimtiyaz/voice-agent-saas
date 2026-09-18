import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

/**
 * Hand-written mirror of db/schema.ts, applied to a fresh in-memory
 * Postgres instance for each test file. This is intentionally NOT
 * generated from drizzle-kit — Phase 0 has no real migrations yet
 * (see drizzle.config.ts / README), so tests own their own copy of
 * the DDL. If the two drift apart, a test that depends on the drifted
 * column/constraint will fail — that's the signal to update this file.
 */
const SCHEMA_SQL = `
  create type member_role as enum ('owner', 'admin', 'member');
  create type agent_status as enum ('draft', 'active', 'disabled');
  create type phone_number_status as enum ('active', 'inactive');
  create type call_status as enum ('ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'voicemail');
  create type transcript_role as enum ('user', 'assistant', 'system');
  create type webhook_provider as enum ('twilio', 'vapi');
  create type appointment_status as enum ('scheduled', 'completed', 'cancelled');
  create type job_status as enum ('open', 'in_progress', 'completed', 'cancelled');
  create type tool_execution_status as enum ('success', 'failure');
  create type call_outcome as enum ('appointment_booked', 'job_created', 'transferred_to_human', 'sms_sent');

  create table organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index organizations_slug_unique on organizations (slug);

  create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    password_hash text not null,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index users_email_unique on users (email);

  create table organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    role member_role not null default 'member',
    created_at timestamptz not null default now()
  );
  create unique index organization_members_org_user_unique
    on organization_members (organization_id, user_id);

  create table agents (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    name text not null,
    description text,
    system_prompt text,
    voice_config jsonb,
    language text not null default 'en',
    status agent_status not null default 'draft',
    vapi_assistant_id text,
    transfer_number text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table phone_numbers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    agent_id uuid references agents (id) on delete set null,
    twilio_number_sid text not null,
    e164_number text not null,
    vapi_phone_number_id text,
    status phone_number_status not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index phone_numbers_twilio_sid_unique on phone_numbers (twilio_number_sid);
  create unique index phone_numbers_e164_unique on phone_numbers (e164_number);

  create table calls (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    agent_id uuid not null references agents (id) on delete cascade,
    phone_number_id uuid not null references phone_numbers (id) on delete cascade,
    twilio_call_sid text not null,
    vapi_call_id text,
    from_number text not null,
    to_number text not null,
    status call_status not null default 'ringing',
    ended_reason text,
    outcome call_outcome,
    started_at timestamptz not null default now(),
    answered_at timestamptz,
    ended_at timestamptz,
    duration_seconds integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index calls_twilio_call_sid_unique on calls (twilio_call_sid);
  create unique index calls_vapi_call_id_unique on calls (vapi_call_id);
  create index calls_organization_id_idx on calls (organization_id);

  create table call_transcripts (
    id uuid primary key default gen_random_uuid(),
    call_id uuid not null references calls (id) on delete cascade,
    role transcript_role not null,
    content text not null,
    "timestamp" timestamptz not null default now(),
    sequence_number integer not null,
    metadata jsonb,
    created_at timestamptz not null default now()
  );
  create unique index call_transcripts_call_sequence_unique
    on call_transcripts (call_id, sequence_number);

  create table webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider webhook_provider not null,
    external_event_id text not null,
    event_type text not null,
    payload jsonb not null,
    processed_at timestamptz,
    created_at timestamptz not null default now()
  );
  create unique index webhook_events_provider_event_unique
    on webhook_events (provider, external_event_id);

  create table customers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    name text not null,
    phone text not null,
    email text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index customers_organization_phone_unique on customers (organization_id, phone);

  create table appointments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    customer_id uuid not null references customers (id) on delete cascade,
    agent_id uuid not null references agents (id) on delete cascade,
    call_id uuid references calls (id) on delete set null,
    scheduled_at timestamptz not null,
    duration_minutes integer not null default 30,
    status appointment_status not null default 'scheduled',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index appointments_organization_id_idx on appointments (organization_id);

  create table jobs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    customer_id uuid not null references customers (id) on delete cascade,
    appointment_id uuid references appointments (id) on delete set null,
    description text not null,
    status job_status not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index jobs_organization_id_idx on jobs (organization_id);

  create table tool_executions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    agent_id uuid not null references agents (id) on delete cascade,
    call_id uuid references calls (id) on delete cascade,
    tool_name text not null,
    input jsonb not null,
    output jsonb,
    status tool_execution_status not null,
    error text,
    duration_ms integer not null,
    created_at timestamptz not null default now()
  );
  create index tool_executions_call_id_idx on tool_executions (call_id);
`;

export async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(SCHEMA_SQL);
  return drizzle(client, { schema });
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
