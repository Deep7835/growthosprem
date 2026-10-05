-- Task comments: tenant isolation (same policy as drizzle/0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON task_comments TO app_user;
--> statement-breakpoint
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON task_comments
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
-- push_subscriptions has no org_id: only the server (privileged connection) and the worker use it.
REVOKE ALL ON push_subscriptions FROM app_user;
--> statement-breakpoint
-- Every space gets a task status set (ST-03), and existing tasks move into it.
INSERT INTO statuses (org_id, space_id, name, color, category, applies_to, position)
SELECT sp.org_id, sp.id, t.name, t.color, t.category::status_category, 'task', t.position
FROM spaces sp
CROSS JOIN (VALUES
  ('To do', '#9CA3AF', 'not_started', 100),
  ('Doing', '#F2A93B', 'active', 101),
  ('Done', '#34D399', 'completed', 102),
  ('Won’t do', '#6B7280', 'closed', 103)
) AS t(name, color, category, position)
WHERE NOT EXISTS (SELECT 1 FROM statuses x WHERE x.space_id = sp.id AND x.applies_to = 'task');
--> statement-breakpoint
UPDATE tasks SET status_id = (
  SELECT x.id FROM statuses x
  WHERE x.space_id = tasks.space_id AND x.applies_to = 'task'
    AND x.category = CASE WHEN tasks.done THEN 'completed'::status_category ELSE 'not_started'::status_category END
  ORDER BY x.position LIMIT 1
)
WHERE status_id IS NULL;
