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
  create type voice_provider as enum ('vapi', 'openai_realtime');
  create type phone_number_status as enum ('active', 'inactive');
  create type call_status as enum ('ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'voicemail');
  create type transcript_role as enum ('user', 'assistant', 'system');
  create type webhook_provider as enum ('twilio', 'vapi');
  create type appointment_status as enum ('scheduled', 'completed', 'cancelled');
  create type job_status as enum ('open', 'in_progress', 'completed', 'cancelled');
  create type tool_execution_status as enum ('success', 'failure');
  create type call_outcome as enum ('appointment_booked', 'job_created', 'transferred_to_human', 'sms_sent');
  create type call_handoff_status as enum ('initiated', 'connected', 'completed', 'no_answer', 'failed');
  create type campaign_status as enum ('draft', 'scheduled', 'active', 'paused', 'completed');
  create type campaign_contact_status as enum ('pending', 'calling', 'completed', 'failed', 'no_answer');
  create type knowledge_file_status as enum ('processing', 'done', 'failed');
  create type demo_request_status as enum ('new', 'contacted', 'closed');
  create type email_outbox_status as enum ('pending', 'sent', 'failed');

  create table organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index organizations_slug_unique on organizations (slug);

  create table google_calendar_integrations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    calendar_id text not null default 'primary',
    encrypted_refresh_token text not null,
    connected_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index google_calendar_integrations_organization_unique
    on google_calendar_integrations (organization_id);

  create table hubspot_integrations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    encrypted_refresh_token text not null,
    connected_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index hubspot_integrations_organization_unique
    on hubspot_integrations (organization_id);

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

  create table organization_invites (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    invited_by_user_id uuid references users (id) on delete set null,
    email text not null,
    role member_role not null default 'member',
    token_hash text not null,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
  );
  create unique index organization_invites_token_hash_unique
    on organization_invites (token_hash);
  create unique index organization_invites_pending_email_unique
    on organization_invites (organization_id, email)
    where accepted_at is null and revoked_at is null;
  create index organization_invites_organization_email_idx
    on organization_invites (organization_id, email);
  create index organization_invites_organization_created_idx
    on organization_invites (organization_id, created_at);

  create table api_keys (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    created_by_user_id uuid references users (id) on delete set null,
    name text not null,
    key_prefix text not null,
    key_hash text not null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz
  );
  create unique index api_keys_key_hash_unique on api_keys (key_hash);
  create index api_keys_organization_id_idx on api_keys (organization_id);

  create table agents (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    name text not null,
    description text,
    system_prompt text,
    voice_config jsonb,
    language text not null default 'en',
    status agent_status not null default 'draft',
    voice_provider voice_provider not null default 'vapi',
    vapi_assistant_id text,
    vapi_knowledge_tool_id text,
    transfer_number text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table agent_knowledge_files (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    agent_id uuid not null references agents (id) on delete cascade,
    vapi_file_id text not null,
    name text not null,
    bytes integer not null,
    status knowledge_file_status not null default 'processing',
    created_at timestamptz not null default now()
  );
  create unique index agent_knowledge_files_vapi_file_unique
    on agent_knowledge_files (vapi_file_id);
  create index agent_knowledge_files_agent_id_idx on agent_knowledge_files (agent_id);
  create index agent_knowledge_files_organization_agent_idx
    on agent_knowledge_files (organization_id, agent_id);

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

  create table campaigns (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    name text not null,
    agent_id uuid not null references agents (id) on delete restrict,
    phone_number_id uuid not null references phone_numbers (id) on delete restrict,
    status campaign_status not null default 'draft',
    active_contact_id uuid,
    scheduled_at timestamptz,
    dispatch_interval_seconds integer not null default 60,
    last_dispatched_at timestamptz,
    max_attempts integer not null default 3,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index campaigns_organization_id_idx on campaigns (organization_id);

  create table campaign_contacts (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references campaigns (id) on delete cascade,
    phone_number text not null,
    consent_confirmed_at timestamptz not null,
    consent_confirmed_by_user_id uuid not null references users (id) on delete restrict,
    status campaign_contact_status not null default 'pending',
    attempts integer not null default 0,
    next_attempt_at timestamptz,
    last_error text,
    created_at timestamptz not null default now()
  );
  create unique index campaign_contacts_campaign_phone_unique
    on campaign_contacts (campaign_id, phone_number);
  create index campaign_contacts_campaign_status_idx
    on campaign_contacts (campaign_id, status);
  create index campaign_contacts_pending_idx
    on campaign_contacts (campaign_id, status, next_attempt_at);

  create table calls (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    agent_id uuid not null references agents (id) on delete cascade,
    phone_number_id uuid not null references phone_numbers (id) on delete cascade,
    campaign_contact_id uuid references campaign_contacts (id) on delete set null,
    twilio_call_sid text,
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

  create table call_handoffs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    call_id uuid not null references calls (id) on delete cascade,
    destination_number text not null,
    reason text,
    summary text not null,
    status call_handoff_status not null default 'initiated',
    created_at timestamptz not null default now(),
    answered_at timestamptz,
    ended_at timestamptz
  );
  create index call_handoffs_organization_created_idx
    on call_handoffs (organization_id, created_at);
  create index call_handoffs_call_id_idx on call_handoffs (call_id);

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
    hubspot_contact_id text,
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
    google_event_id text,
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
    hubspot_deal_id text,
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

  create table demo_requests (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    company text,
    phone text,
    use_case text,
    call_volume text,
    message text,
    status demo_request_status not null default 'new',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index demo_requests_email_unique on demo_requests (email);
  create index demo_requests_status_created_idx
    on demo_requests (status, created_at);

  create table email_outbox (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations (id) on delete cascade,
    to_email text not null,
    subject text not null,
    body text not null,
    kind text not null default 'organization_invite',
    status email_outbox_status not null default 'pending',
    attempts integer not null default 0,
    last_error text,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index email_outbox_organization_created_idx
    on email_outbox (organization_id, created_at);
  create index email_outbox_status_created_idx
    on email_outbox (status, created_at);

  create table rate_limit_counters (
    bucket text not null,
    key text not null,
    window_start timestamptz not null,
    count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index rate_limit_counters_bucket_key_window_unique
    on rate_limit_counters (bucket, key, window_start);
  create index rate_limit_counters_window_start_idx
    on rate_limit_counters (window_start);
`;

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

const openClients: PGlite[] = [];

export async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(SCHEMA_SQL);
  openClients.push(client);
  return drizzle(client, { schema });
}

export async function closeAllTestDatabases(): Promise<void> {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
}
