ALTER TYPE "public"."campaign_status" ADD VALUE 'scheduled' BEFORE 'active';--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "dispatch_interval_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_contacts_pending_idx" ON "campaign_contacts" USING btree ("campaign_id","status","next_attempt_at");