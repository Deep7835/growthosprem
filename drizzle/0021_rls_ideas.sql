-- Tenant isolation for the Idea Bank (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON ideas TO app_user;
--> statement-breakpoint
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ideas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ideas
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
