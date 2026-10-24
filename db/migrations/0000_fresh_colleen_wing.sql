CREATE TYPE "public"."agent_status" AS ENUM('draft', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."call_handoff_status" AS ENUM('initiated', 'connected', 'completed', 'no_answer', 'failed');--> statement-breakpoint
CREATE TYPE "public"."call_outcome" AS ENUM('appointment_booked', 'job_created', 'transferred_to_human', 'sms_sent');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'voicemail');--> statement-breakpoint
CREATE TYPE "public"."campaign_contact_status" AS ENUM('pending', 'calling', 'completed', 'failed', 'no_answer');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."knowledge_file_status" AS ENUM('processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."phone_number_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."tool_execution_status" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."transcript_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."voice_provider" AS ENUM('vapi', 'openai_realtime');--> statement-breakpoint
CREATE TYPE "public"."webhook_provider" AS ENUM('twilio', 'vapi');--> statement-breakpoint
CREATE TABLE "agent_knowledge_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"vapi_file_id" text NOT NULL,
	"name" text NOT NULL,
	"bytes" integer NOT NULL,
	"status" "knowledge_file_status" DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text,
	"voice_config" jsonb,
	"language" text DEFAULT 'en' NOT NULL,
	"status" "agent_status" DEFAULT 'draft' NOT NULL,
	"voice_provider" "voice_provider" DEFAULT 'vapi' NOT NULL,
	"vapi_assistant_id" text,
	"vapi_knowledge_tool_id" text,
	"transfer_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"call_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"google_event_id" text,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"destination_number" text NOT NULL,
	"reason" text,
	"summary" text NOT NULL,
	"status" "call_handoff_status" DEFAULT 'initiated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "call_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"role" "transcript_role" NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"sequence_number" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"phone_number_id" uuid NOT NULL,
	"campaign_contact_id" uuid,
	"twilio_call_sid" text,
	"vapi_call_id" text,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"status" "call_status" DEFAULT 'ringing' NOT NULL,
	"ended_reason" text,
	"outcome" "call_outcome",
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"consent_confirmed_at" timestamp with time zone NOT NULL,
	"consent_confirmed_by_user_id" uuid NOT NULL,
	"status" "campaign_contact_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"phone_number_id" uuid NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"active_contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"notes" text,
	"hubspot_contact_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubspot_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"appointment_id" uuid,
	"description" text NOT NULL,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"hubspot_deal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_by_user_id" uuid,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid,
	"twilio_number_sid" text NOT NULL,
	"e164_number" text NOT NULL,
	"vapi_phone_number_id" text,
	"status" "phone_number_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"call_id" uuid,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"status" "tool_execution_status" NOT NULL,
	"error" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "webhook_provider" NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge_files" ADD CONSTRAINT "agent_knowledge_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_files" ADD CONSTRAINT "agent_knowledge_files_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_handoffs" ADD CONSTRAINT "call_handoffs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_handoffs" ADD CONSTRAINT "call_handoffs_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_campaign_contact_id_campaign_contacts_id_fk" FOREIGN KEY ("campaign_contact_id") REFERENCES "public"."campaign_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_consent_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("consent_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_integrations" ADD CONSTRAINT "hubspot_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_knowledge_files_vapi_file_unique" ON "agent_knowledge_files" USING btree ("vapi_file_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_files_agent_id_idx" ON "agent_knowledge_files" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_files_organization_agent_idx" ON "agent_knowledge_files" USING btree ("organization_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "appointments_organization_id_idx" ON "appointments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "call_handoffs_organization_created_idx" ON "call_handoffs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "call_handoffs_call_id_idx" ON "call_handoffs" USING btree ("call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_transcripts_call_sequence_unique" ON "call_transcripts" USING btree ("call_id","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_twilio_call_sid_unique" ON "calls" USING btree ("twilio_call_sid");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_vapi_call_id_unique" ON "calls" USING btree ("vapi_call_id");--> statement-breakpoint
CREATE INDEX "calls_organization_id_idx" ON "calls" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_contacts_campaign_phone_unique" ON "campaign_contacts" USING btree ("campaign_id","phone_number");--> statement-breakpoint
CREATE INDEX "campaign_contacts_campaign_status_idx" ON "campaign_contacts" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_organization_id_idx" ON "campaigns" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_organization_phone_unique" ON "customers" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_integrations_organization_unique" ON "google_calendar_integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_integrations_organization_unique" ON "hubspot_integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "jobs_organization_id_idx" ON "jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invites_token_hash_unique" ON "organization_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invites_pending_email_unique" ON "organization_invites" USING btree ("organization_id","email") WHERE "organization_invites"."accepted_at" is null and "organization_invites"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "organization_invites_organization_email_idx" ON "organization_invites" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "organization_invites_organization_created_idx" ON "organization_invites" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_unique" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_twilio_sid_unique" ON "phone_numbers" USING btree ("twilio_number_sid");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_e164_unique" ON "phone_numbers" USING btree ("e164_number");--> statement-breakpoint
CREATE INDEX "tool_executions_call_id_idx" ON "tool_executions" USING btree ("call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_unique" ON "webhook_events" USING btree ("provider","external_event_id");