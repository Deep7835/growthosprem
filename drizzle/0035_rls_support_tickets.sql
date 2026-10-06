-- Tenant isolation for Support Center tickets (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON support_tickets TO app_user;
--> statement-breakpoint
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON support_tickets
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
