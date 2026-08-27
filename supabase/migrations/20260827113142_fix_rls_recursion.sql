/*
# Fix RLS recursion on profiles and all CRM tables

The problem: profiles select policy uses a subquery on profiles itself,
causing infinite RLS recursion. All CRM tables reference profiles in their
policies, so they inherit the same recursion.

Solution: Create a SECURITY DEFINER function get_workspace_id() that
returns the caller's workspace_id without triggering RLS, and update
all policies to use it instead of the subquery.
*/

-- ============ SECURITY DEFINER FUNCTION ============
CREATE OR REPLACE FUNCTION public.get_workspace_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_id() TO authenticated;

-- ============ FIX PROFILES POLICIES ============
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    workspace_id = public.get_workspace_id()
  );

-- ============ FIX LEADS POLICIES ============
DROP POLICY IF EXISTS "select_leads" ON leads;
CREATE POLICY "select_leads" ON leads FOR SELECT
  TO authenticated USING (
    workspace_id = public.get_workspace_id()
  );

DROP POLICY IF EXISTS "insert_leads" ON leads;
CREATE POLICY "insert_leads" ON leads FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = public.get_workspace_id()
  );

DROP POLICY IF EXISTS "update_leads" ON leads;
CREATE POLICY "update_leads" ON leads FOR UPDATE
  TO authenticated USING (
    workspace_id = public.get_workspace_id()
  ) WITH CHECK (
    workspace_id = public.get_workspace_id()
  );

DROP POLICY IF EXISTS "delete_leads" ON leads;
CREATE POLICY "delete_leads" ON leads FOR DELETE
  TO authenticated USING (
    workspace_id = public.get_workspace_id()
  );

-- ============ FIX ALL CRM TABLES ============
-- We need to update all tables that use the subquery pattern

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'contacts', 'vehicles', 'insurers', 'windscreen_cases', 'case_documents',
    'appointments', 'tasks', 'notes', 'activities', 'communications',
    'sms_templates', 'notifications', 'workflows', 'workflow_runs',
    'campaigns', 'quotes', 'invoices', 'payments', 'gifts', 'after_sales_cases'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- SELECT
    EXECUTE format(
      'DROP POLICY IF EXISTS "select_%s" ON %s;
       CREATE POLICY "select_%s" ON %s FOR SELECT
         TO authenticated USING (workspace_id = public.get_workspace_id());',
      tbl, tbl, tbl, tbl
    );
    -- INSERT
    EXECUTE format(
      'DROP POLICY IF EXISTS "insert_%s" ON %s;
       CREATE POLICY "insert_%s" ON %s FOR INSERT
         TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());',
      tbl, tbl, tbl, tbl
    );
    -- UPDATE
    EXECUTE format(
      'DROP POLICY IF EXISTS "update_%s" ON %s;
       CREATE POLICY "update_%s" ON %s FOR UPDATE
         TO authenticated USING (workspace_id = public.get_workspace_id())
         WITH CHECK (workspace_id = public.get_workspace_id());',
      tbl, tbl, tbl, tbl
    );
    -- DELETE
    EXECUTE format(
      'DROP POLICY IF EXISTS "delete_%s" ON %s;
       CREATE POLICY "delete_%s" ON %s FOR DELETE
         TO authenticated USING (workspace_id = public.get_workspace_id());',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- ============ FIX ACTIVITIES (no DELETE policy) ============
DROP POLICY IF EXISTS "insert_activities" ON activities;
CREATE POLICY "insert_activities" ON activities FOR INSERT
  TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());

-- ============ FIX WORKFLOW_RUNS (no DELETE policy originally) ============
-- Already handled by the loop above, but ensure INSERT exists
DROP POLICY IF EXISTS "insert_workflow_runs" ON workflow_runs;
CREATE POLICY "insert_workflow_runs" ON workflow_runs FOR INSERT
  TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());

-- ============ FIX OTHER EXISTING TABLES ============
-- integration_connections
DROP POLICY IF EXISTS "select_integration_connections" ON integration_connections;
CREATE POLICY "select_integration_connections" ON integration_connections FOR SELECT
  TO authenticated USING (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "insert_integration_connections" ON integration_connections;
CREATE POLICY "insert_integration_connections" ON integration_connections FOR INSERT
  TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "update_integration_connections" ON integration_connections;
CREATE POLICY "update_integration_connections" ON integration_connections FOR UPDATE
  TO authenticated USING (workspace_id = public.get_workspace_id())
  WITH CHECK (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "delete_integration_connections" ON integration_connections;
CREATE POLICY "delete_integration_connections" ON integration_connections FOR DELETE
  TO authenticated USING (workspace_id = public.get_workspace_id());

-- meta_forms
DROP POLICY IF EXISTS "select_meta_forms" ON meta_forms;
CREATE POLICY "select_meta_forms" ON meta_forms FOR SELECT
  TO authenticated USING (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "insert_meta_forms" ON meta_forms;
CREATE POLICY "insert_meta_forms" ON meta_forms FOR INSERT
  TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "update_meta_forms" ON meta_forms;
CREATE POLICY "update_meta_forms" ON meta_forms FOR UPDATE
  TO authenticated USING (workspace_id = public.get_workspace_id())
  WITH CHECK (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "delete_meta_forms" ON meta_forms;
CREATE POLICY "delete_meta_forms" ON meta_forms FOR DELETE
  TO authenticated USING (workspace_id = public.get_workspace_id());

-- webhook_endpoints
DROP POLICY IF EXISTS "select_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "select_webhook_endpoints" ON webhook_endpoints FOR SELECT
  TO authenticated USING (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "insert_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "insert_webhook_endpoints" ON webhook_endpoints FOR INSERT
  TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "update_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "update_webhook_endpoints" ON webhook_endpoints FOR UPDATE
  TO authenticated USING (workspace_id = public.get_workspace_id())
  WITH CHECK (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "delete_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "delete_webhook_endpoints" ON webhook_endpoints FOR DELETE
  TO authenticated USING (workspace_id = public.get_workspace_id());

-- webhook_events
DROP POLICY IF EXISTS "select_webhook_events" ON webhook_events;
CREATE POLICY "select_webhook_events" ON webhook_events FOR SELECT
  TO authenticated USING (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "insert_webhook_events" ON webhook_events;
CREATE POLICY "insert_webhook_events" ON webhook_events FOR INSERT
  TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "update_webhook_events" ON webhook_events;
CREATE POLICY "update_webhook_events" ON webhook_events FOR UPDATE
  TO authenticated USING (workspace_id = public.get_workspace_id())
  WITH CHECK (workspace_id = public.get_workspace_id());

-- audit_logs
DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (workspace_id = public.get_workspace_id());

DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (workspace_id = public.get_workspace_id());

-- ============ FIX ADMIN UPDATE PROFILES ============
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin' AND p.workspace_id = profiles.workspace_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin' AND p.workspace_id = profiles.workspace_id)
  );
