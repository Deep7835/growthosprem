-- Tenant isolation for strategy tables (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON strategies, strategy_versions, content_plans, space_moments TO app_user;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['strategies', 'strategy_versions', 'content_plans', 'space_moments']
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
