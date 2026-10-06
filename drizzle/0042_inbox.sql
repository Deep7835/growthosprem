CREATE TYPE "public"."inbox_kind" AS ENUM('comment', 'message');--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"external_id" text,
	"direction" text NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"sent_by" uuid
);
--> statement-breakpoint
CREATE TABLE "inbox_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"social_account_id" uuid,
	"platform" text NOT NULL,
	"kind" "inbox_kind" DEFAULT 'comment' NOT NULL,
	"external_id" text NOT NULL,
	"post_id" uuid,
	"participant" text NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_thread_id_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."inbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_messages_external" ON "inbox_messages" USING btree ("thread_id","external_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_thread" ON "inbox_messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_threads_external" ON "inbox_threads" USING btree ("space_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "inbox_threads_space" ON "inbox_threads" USING btree ("space_id","last_at");