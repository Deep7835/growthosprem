-- Tenant isolation for invites (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO app_user;
--> statement-breakpoint
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invites
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
