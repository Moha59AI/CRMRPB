/*
# Create initial CRM schema for Relais Pare-Brise (v2)

Creates all foundational tables with RLS policies.
See first migration for full details.
*/

-- ============ WORKSPACES ============
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_key ON workspaces (slug);

DROP POLICY IF EXISTS "select_workspaces" ON workspaces;
CREATE POLICY "select_workspaces" ON workspaces FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_workspaces" ON workspaces;
CREATE POLICY "insert_workspaces" ON workspaces FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_workspaces" ON workspaces;
CREATE POLICY "update_workspaces" ON workspaces FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  role text NOT NULL DEFAULT 'advisor' CHECK (role IN ('admin', 'manager', 'advisor', 'technician', 'accountant')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS profiles_workspace_id_idx ON profiles (workspace_id);

DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = profiles.workspace_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = profiles.workspace_id
    )
  );

-- ============ LEADS ============
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  phone text,
  email text,
  city text,
  vehicle_registration text,
  vehicle_make text,
  vehicle_model text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('meta', 'webhook', 'manual', 'import')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'scheduled', 'converted', 'lost')),
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meta_lead_id text,
  meta_page_id text,
  meta_form_id text,
  meta_ad_id text,
  meta_adset_id text,
  meta_campaign_id text,
  fbclid text,
  fbc text,
  fbp text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  raw_payload jsonb,
  received_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS leads_workspace_id_idx ON leads (workspace_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_source_idx ON leads (source);
CREATE INDEX IF NOT EXISTS leads_assigned_user_id_idx ON leads (assigned_user_id);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads (phone);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (email);
CREATE INDEX IF NOT EXISTS leads_vehicle_registration_idx ON leads (vehicle_registration);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS leads_meta_lead_id_unique ON leads (meta_lead_id) WHERE meta_lead_id IS NOT NULL;

DROP POLICY IF EXISTS "select_leads" ON leads;
CREATE POLICY "select_leads" ON leads FOR SELECT
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_leads" ON leads;
CREATE POLICY "insert_leads" ON leads FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_leads" ON leads;
CREATE POLICY "update_leads" ON leads FOR UPDATE
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  ) WITH CHECK (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_leads" ON leads;
CREATE POLICY "delete_leads" ON leads FOR DELETE
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- ============ INTEGRATION_CONNECTIONS ============
CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta', 'google', 'custom')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('connected', 'error', 'not_configured')),
  settings jsonb DEFAULT '{}'::jsonb,
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS integration_connections_workspace_id_idx ON integration_connections (workspace_id);
CREATE INDEX IF NOT EXISTS integration_connections_provider_idx ON integration_connections (provider);

DROP POLICY IF EXISTS "select_integration_connections" ON integration_connections;
CREATE POLICY "select_integration_connections" ON integration_connections FOR SELECT
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_insert_integration_connections" ON integration_connections;
CREATE POLICY "admin_insert_integration_connections" ON integration_connections FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = integration_connections.workspace_id
    )
  );

DROP POLICY IF EXISTS "admin_update_integration_connections" ON integration_connections;
CREATE POLICY "admin_update_integration_connections" ON integration_connections FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = integration_connections.workspace_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = integration_connections.workspace_id
    )
  );

DROP POLICY IF EXISTS "admin_delete_integration_connections" ON integration_connections;
CREATE POLICY "admin_delete_integration_connections" ON integration_connections FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = integration_connections.workspace_id
    )
  );

-- ============ META_FORMS ============
CREATE TABLE IF NOT EXISTS meta_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  meta_page_id text,
  meta_form_id text,
  form_name text,
  enabled boolean DEFAULT true,
  field_mapping jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE meta_forms ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS meta_forms_workspace_id_idx ON meta_forms (workspace_id);
CREATE INDEX IF NOT EXISTS meta_forms_connection_id_idx ON meta_forms (connection_id);

DROP POLICY IF EXISTS "select_meta_forms" ON meta_forms;
CREATE POLICY "select_meta_forms" ON meta_forms FOR SELECT
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_insert_meta_forms" ON meta_forms;
CREATE POLICY "admin_insert_meta_forms" ON meta_forms FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = meta_forms.workspace_id
    )
  );

DROP POLICY IF EXISTS "admin_update_meta_forms" ON meta_forms;
CREATE POLICY "admin_update_meta_forms" ON meta_forms FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = meta_forms.workspace_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = meta_forms.workspace_id
    )
  );

DROP POLICY IF EXISTS "admin_delete_meta_forms" ON meta_forms;
CREATE POLICY "admin_delete_meta_forms" ON meta_forms FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = meta_forms.workspace_id
    )
  );

-- ============ WEBHOOK_ENDPOINTS ============
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'custom',
  endpoint_key text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  enabled boolean DEFAULT true,
  signing_secret_reference text,
  configuration jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS webhook_endpoints_workspace_id_idx ON webhook_endpoints (workspace_id);
CREATE INDEX IF NOT EXISTS webhook_endpoints_endpoint_key_idx ON webhook_endpoints (endpoint_key);

DROP POLICY IF EXISTS "select_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "select_webhook_endpoints" ON webhook_endpoints FOR SELECT
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_insert_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "admin_insert_webhook_endpoints" ON webhook_endpoints FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = webhook_endpoints.workspace_id
    )
  );

DROP POLICY IF EXISTS "admin_update_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "admin_update_webhook_endpoints" ON webhook_endpoints FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = webhook_endpoints.workspace_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = webhook_endpoints.workspace_id
    )
  );

DROP POLICY IF EXISTS "admin_delete_webhook_endpoints" ON webhook_endpoints;
CREATE POLICY "admin_delete_webhook_endpoints" ON webhook_endpoints FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = webhook_endpoints.workspace_id
    )
  );

-- ============ WEBHOOK_EVENTS ============
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES webhook_endpoints(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'custom',
  external_event_id text,
  event_type text,
  headers jsonb,
  payload jsonb,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'processed', 'error', 'skipped')),
  processing_attempts integer NOT NULL DEFAULT 0,
  error_message text,
  received_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS webhook_events_workspace_id_idx ON webhook_events (workspace_id);
CREATE INDEX IF NOT EXISTS webhook_events_endpoint_id_idx ON webhook_events (endpoint_id);
CREATE INDEX IF NOT EXISTS webhook_events_processing_status_idx ON webhook_events (processing_status);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_external_id_unique
  ON webhook_events (endpoint_id, external_event_id)
  WHERE endpoint_id IS NOT NULL AND external_event_id IS NOT NULL;

DROP POLICY IF EXISTS "select_webhook_events" ON webhook_events;
CREATE POLICY "select_webhook_events" ON webhook_events FOR SELECT
  TO authenticated USING (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_update_webhook_events" ON webhook_events;
CREATE POLICY "admin_update_webhook_events" ON webhook_events FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = webhook_events.workspace_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = webhook_events.workspace_id
    )
  );

-- ============ AUDIT_LOGS ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS audit_logs_workspace_id_idx ON audit_logs (workspace_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);

DROP POLICY IF EXISTS "admin_select_audit_logs" ON audit_logs;
CREATE POLICY "admin_select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      AND p.workspace_id = audit_logs.workspace_id
    )
  );

DROP POLICY IF EXISTS "select_own_audit_logs" ON audit_logs;
CREATE POLICY "select_own_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (
      SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'workspaces_updated_at') THEN
    CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON workspaces
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_updated_at') THEN
    CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'leads_updated_at') THEN
    CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'integration_connections_updated_at') THEN
    CREATE TRIGGER integration_connections_updated_at BEFORE UPDATE ON integration_connections
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'meta_forms_updated_at') THEN
    CREATE TRIGGER meta_forms_updated_at BEFORE UPDATE ON meta_forms
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'webhook_endpoints_updated_at') THEN
    CREATE TRIGGER webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
