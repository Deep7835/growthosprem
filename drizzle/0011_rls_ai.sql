-- Tenant isolation for AI tables (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_brains, ai_conversations, ai_messages, ai_actions, usage_events TO app_user;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_brains', 'ai_conversations', 'ai_messages', 'ai_actions', 'usage_events']
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
