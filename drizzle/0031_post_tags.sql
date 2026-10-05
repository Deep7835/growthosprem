ALTER TABLE "posts" ADD COLUMN "hook_type" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "tagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "tag_source" text;--> statement-breakpoint
CREATE INDEX "posts_untagged" ON "posts" USING btree ("space_id","tagged_at");