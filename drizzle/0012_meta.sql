ALTER TYPE "public"."account_status" ADD VALUE 'disconnected';--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"done_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "oauth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"data_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "page_id" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "access_token_enc" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "connected_by" uuid;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "sync_state" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "sync_progress" jsonb;--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_sessions" ADD CONSTRAINT "oauth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_due" ON "jobs" USING btree ("done_at","failed_at","priority","run_at");--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_space_external" ON "social_accounts" USING btree ("space_id","platform","external_id");