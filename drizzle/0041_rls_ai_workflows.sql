-- Tenant isolation for saved prompts, personas and workflows (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_prompts, ai_personas, ai_workflows, ai_workflow_runs TO app_user;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_prompts', 'ai_personas', 'ai_workflows', 'ai_workflow_runs']
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
