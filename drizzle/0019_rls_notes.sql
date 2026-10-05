-- Tenant isolation for notes (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO app_user;
--> statement-breakpoint
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notes
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
