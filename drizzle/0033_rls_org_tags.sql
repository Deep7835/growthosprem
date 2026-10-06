-- Tenant isolation for the organisation's tag list (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON org_tags TO app_user;
--> statement-breakpoint
ALTER TABLE org_tags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE org_tags FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON org_tags
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
