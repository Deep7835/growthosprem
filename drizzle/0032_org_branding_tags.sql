CREATE TABLE "org_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_secondary" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_data" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "branding_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_tags" ADD CONSTRAINT "org_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_tags_name" ON "org_tags" USING btree ("org_id","name");