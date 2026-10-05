-- Tenant isolation for OAuth sessions (same policy as drizzle/0001_rls.sql).
-- jobs has no org_id: only the privileged worker uses it, so app_user gets no access.
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_sessions TO app_user;
--> statement-breakpoint
REVOKE ALL ON jobs FROM app_user;
--> statement-breakpoint
ALTER TABLE oauth_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE oauth_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON oauth_sessions
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
