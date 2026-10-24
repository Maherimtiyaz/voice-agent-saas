CREATE TYPE "public"."demo_request_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."email_outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"phone" text,
	"use_case" text,
	"call_volume" text,
	"message" text,
	"status" "demo_request_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"kind" text DEFAULT 'organization_invite' NOT NULL,
	"status" "email_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_requests_email_unique" ON "demo_requests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "demo_requests_status_created_idx" ON "demo_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_organization_created_idx" ON "email_outbox" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_counters_bucket_key_window_unique" ON "rate_limit_counters" USING btree ("bucket","key","window_start");--> statement-breakpoint
CREATE INDEX "rate_limit_counters_window_start_idx" ON "rate_limit_counters" USING btree ("window_start");