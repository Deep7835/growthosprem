CREATE TYPE "public"."placement_state" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "state" "placement_state" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "publish_step" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "container_id" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "permalink" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "published_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "error_retryable" boolean;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
-- Placements of posts that were already scheduled before per-placement states existed.
UPDATE "placements" SET "state" = 'scheduled'
FROM "content_items"
WHERE "content_items"."id" = "placements"."content_item_id" AND "content_items"."publish_state" = 'scheduled';
