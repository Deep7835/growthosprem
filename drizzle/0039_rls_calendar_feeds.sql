-- Tenant isolation for calendar feeds (same policy as drizzle/0001_rls.sql). The feed URL is
-- looked up by token hash with the system connection, like share links.
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_feeds TO app_user;
--> statement-breakpoint
ALTER TABLE calendar_feeds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_feeds FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON calendar_feeds
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
