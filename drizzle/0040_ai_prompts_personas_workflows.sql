CREATE TYPE "public"."workflow_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."workflow_kind" AS ENUM('ideas', 'analytics', 'overdue', 'unscheduled', 'festivals', 'custom');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "ai_personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"voice" text DEFAULT '' NOT NULL,
	"avoid" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"output" text DEFAULT '' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"space_id" uuid,
	"created_by" uuid,
	"kind" "workflow_kind" NOT NULL,
	"name" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"cadence" "workflow_cadence" DEFAULT 'weekly' NOT NULL,
	"weekday" integer DEFAULT 0 NOT NULL,
	"hour" integer DEFAULT 9 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_personas" ADD CONSTRAINT "ai_personas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_personas" ADD CONSTRAINT "ai_personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_runs" ADD CONSTRAINT "ai_workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_runs" ADD CONSTRAINT "ai_workflow_runs_workflow_id_ai_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."ai_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflows" ADD CONSTRAINT "ai_workflows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflows" ADD CONSTRAINT "ai_workflows_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflows" ADD CONSTRAINT "ai_workflows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_personas_user" ON "ai_personas" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_prompts_user" ON "ai_prompts" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_workflow_runs_workflow" ON "ai_workflow_runs" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_workflows_due" ON "ai_workflows" USING btree ("enabled","next_run_at");