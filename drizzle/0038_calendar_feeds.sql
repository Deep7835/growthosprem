CREATE TABLE "calendar_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"include_tasks" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_token" ON "calendar_feeds" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_user" ON "calendar_feeds" USING btree ("org_id","user_id");