-- Tenant isolation for the Inbox (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON inbox_threads, inbox_messages TO app_user;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inbox_threads', 'inbox_messages']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)
         WITH CHECK (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;
