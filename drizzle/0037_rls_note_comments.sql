-- Tenant isolation for note comments (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON note_comments TO app_user;
--> statement-breakpoint
ALTER TABLE note_comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE note_comments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON note_comments
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
