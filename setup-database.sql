-- =====================================================================
-- Relais Pare-Brise CRM -- installation complete de la base de donnees
-- =====================================================================
-- Concatenation des 6 migrations, dans l'ordre chronologique.
-- A coller tel quel dans Supabase > SQL Editor > New query > Run.
-- Idempotent : relancable sans risque.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 20260827095426_create_initial_schema_v2.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260827095452_add_webhook_helper_functions.sql
-- ---------------------------------------------------------------------

/*
# Add service-role helper functions for webhook processing

1. New Functions
- `insert_webhook_event`: SECURITY DEFINER function that allows edge functions (using service role) to insert webhook events. Edge functions already bypass RLS with the service role key, so this is just a convenience wrapper.
- `insert_lead_from_webhook`: SECURITY DEFINER function to safely insert a lead from webhook processing, handling workspace_id assignment and duplicate detection by meta_lead_id.

2. Security
- Both functions are SECURITY DEFINER, executed with the function owner's privileges
- No execute grants to anon or authenticated - only the service role (postgres) can call them
- This ensures edge functions using the service role key can insert data, but regular users cannot bypass RLS

3. Notes
- The insert_lead_from_webhook function checks for existing meta_lead_id to prevent duplicates
- Returns the lead UUID (existing or newly created)
*/

-- Helper to upsert a lead from webhook processing
-- Called by edge functions with service role key
CREATE OR REPLACE FUNCTION upsert_lead_from_webhook(
  p_workspace_id uuid,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_vehicle_registration text DEFAULT NULL,
  p_vehicle_make text DEFAULT NULL,
  p_vehicle_model text DEFAULT NULL,
  p_source text DEFAULT 'meta',
  p_meta_lead_id text DEFAULT NULL,
  p_meta_page_id text DEFAULT NULL,
  p_meta_form_id text DEFAULT NULL,
  p_meta_ad_id text DEFAULT NULL,
  p_meta_adset_id text DEFAULT NULL,
  p_meta_campaign_id text DEFAULT NULL,
  p_fbclid text DEFAULT NULL,
  p_fbc text DEFAULT NULL,
  p_fbp text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT NULL,
  p_received_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  -- Check for existing lead by meta_lead_id
  IF p_meta_lead_id IS NOT NULL THEN
    SELECT id INTO v_lead_id FROM leads WHERE meta_lead_id = p_meta_lead_id LIMIT 1;
    IF v_lead_id IS NOT NULL THEN
      -- Update existing lead with any new info
      UPDATE leads SET
        first_name = COALESCE(p_first_name, first_name),
        last_name = COALESCE(p_last_name, last_name),
        phone = COALESCE(p_phone, phone),
        email = COALESCE(p_email, email),
        city = COALESCE(p_city, city),
        vehicle_registration = COALESCE(p_vehicle_registration, vehicle_registration),
        vehicle_make = COALESCE(p_vehicle_make, vehicle_make),
        vehicle_model = COALESCE(p_vehicle_model, vehicle_model),
        raw_payload = COALESCE(p_raw_payload, raw_payload),
        updated_at = now()
      WHERE id = v_lead_id;
      RETURN v_lead_id;
    END IF;
  END IF;

  -- Insert new lead
  INSERT INTO leads (
    workspace_id, first_name, last_name, phone, email, city,
    vehicle_registration, vehicle_make, vehicle_model, source,
    meta_lead_id, meta_page_id, meta_form_id, meta_ad_id, meta_adset_id, meta_campaign_id,
    fbclid, fbc, fbp, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    raw_payload, received_at
  ) VALUES (
    p_workspace_id, p_first_name, p_last_name, p_phone, p_email, p_city,
    p_vehicle_registration, p_vehicle_make, p_vehicle_model, p_source,
    p_meta_lead_id, p_meta_page_id, p_meta_form_id, p_meta_ad_id, p_meta_adset_id, p_meta_campaign_id,
    p_fbclid, p_fbc, p_fbp, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_raw_payload, p_received_at
  )
  RETURNING id INTO v_lead_id;

  RETURN v_lead_id;
END;
$$;

-- Revoke execute from anon and authenticated, only service role (postgres) can call
REVOKE EXECUTE ON FUNCTION upsert_lead_from_webhook FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 20260827103311_add_demo_data_functions.sql
-- ---------------------------------------------------------------------

/*
# Add demo data functions and unique constraint for meta_forms

1. New Functions
- `seed_demo_leads`: SECURITY DEFINER function that inserts demo leads for testing without Meta credentials. Only callable by authenticated users.

2. Changes
- Add unique constraint on meta_forms (workspace_id, meta_form_id) for upsert support

3. Security
- seed_demo_leads is SECURITY DEFINER but requires authenticated user
- Revoke execute from anon
*/

-- Unique constraint for meta_forms upsert
CREATE UNIQUE INDEX IF NOT EXISTS meta_forms_workspace_form_unique
  ON meta_forms (workspace_id, meta_form_id)
  WHERE meta_form_id IS NOT NULL;

-- Demo data seeding function
CREATE OR REPLACE FUNCTION seed_demo_leads(p_workspace_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_lead_id uuid;
BEGIN
  -- Demo lead 1
  INSERT INTO leads (
    workspace_id, first_name, last_name, phone, email, city,
    vehicle_registration, vehicle_make, vehicle_model,
    source, status, meta_lead_id, meta_page_id, meta_form_id,
    meta_campaign_id, meta_ad_id, utm_source, utm_medium, utm_campaign,
    raw_payload, received_at
  ) VALUES (
    p_workspace_id, 'Jean', 'Dupont', '0612345678', 'jean.dupont@email.fr', 'Lyon',
    'AB-123-CD', 'Renault', 'Clio',
    'meta', 'new', 'demo_lead_001', 'demo_page_001', 'demo_form_001',
    'demo_campaign_001', 'demo_ad_001', 'facebook', 'social', 'vitrage_lyon',
    '{"field_data": [{"name": "first_name", "values": ["Jean"]}, {"name": "last_name", "values": ["Dupont"]}, {"name": "phone", "values": ["0612345678"]}, {"name": "email", "values": ["jean.dupont@email.fr"]}, {"name": "city", "values": ["Lyon"]}]}'::jsonb,
    now() - interval '1 hour'
  )
  ON CONFLICT (meta_lead_id) DO NOTHING
  RETURNING id INTO v_lead_id;
  IF v_lead_id IS NOT NULL THEN v_count := v_count + 1; END IF;

  -- Demo lead 2
  INSERT INTO leads (
    workspace_id, first_name, last_name, phone, email, city,
    vehicle_registration, vehicle_make, vehicle_model,
    source, status, meta_lead_id, meta_page_id, meta_form_id,
    meta_campaign_id, meta_ad_id, utm_source, utm_medium, utm_campaign,
    raw_payload, received_at
  ) VALUES (
    p_workspace_id, 'Marie', 'Martin', '0723456789', 'marie.martin@email.fr', 'Paris',
    'EF-456-GH', 'Peugeot', '208',
    'meta', 'contacted', 'demo_lead_002', 'demo_page_001', 'demo_form_001',
    'demo_campaign_001', 'demo_ad_002', 'facebook', 'social', 'vitrage_paris',
    '{"field_data": [{"name": "first_name", "values": ["Marie"]}, {"name": "last_name", "values": ["Martin"]}, {"name": "phone", "values": ["0723456789"]}, {"name": "email", "values": ["marie.martin@email.fr"]}, {"name": "city", "values": ["Paris"]}]}'::jsonb,
    now() - interval '3 hours'
  )
  ON CONFLICT (meta_lead_id) DO NOTHING
  RETURNING id INTO v_lead_id;
  IF v_lead_id IS NOT NULL THEN v_count := v_count + 1; END IF;

  -- Demo lead 3
  INSERT INTO leads (
    workspace_id, first_name, last_name, phone, email, city,
    vehicle_registration, vehicle_make, vehicle_model,
    source, status, meta_lead_id, meta_page_id, meta_form_id,
    meta_campaign_id, meta_ad_id, utm_source, utm_medium, utm_campaign,
    raw_payload, received_at
  ) VALUES (
    p_workspace_id, 'Pierre', 'Durand', '0634567890', 'pierre.durand@email.fr', 'Marseille',
    'IJ-789-KL', 'Citroën', 'C3',
    'meta', 'qualified', 'demo_lead_003', 'demo_page_001', 'demo_form_002',
    'demo_campaign_002', 'demo_ad_003', 'facebook', 'social', 'vitrage_marseille',
    '{"field_data": [{"name": "first_name", "values": ["Pierre"]}, {"name": "last_name", "values": ["Durand"]}, {"name": "phone", "values": ["0634567890"]}, {"name": "email", "values": ["pierre.durand@email.fr"]}, {"name": "city", "values": ["Marseille"]}]}'::jsonb,
    now() - interval '1 day'
  )
  ON CONFLICT (meta_lead_id) DO NOTHING
  RETURNING id INTO v_lead_id;
  IF v_lead_id IS NOT NULL THEN v_count := v_count + 1; END IF;

  -- Demo lead 4 (duplicate phone with lead 1)
  INSERT INTO leads (
    workspace_id, first_name, last_name, phone, email, city,
    vehicle_registration, vehicle_make, vehicle_model,
    source, status, meta_lead_id, meta_page_id, meta_form_id,
    meta_campaign_id, meta_ad_id, utm_source, utm_medium, utm_campaign,
    raw_payload, received_at
  ) VALUES (
    p_workspace_id, 'Sophie', 'Bernard', '0612345678', 'sophie.bernard@email.fr', 'Lyon',
    'MN-012-OP', 'Volkswagen', 'Golf',
    'webhook', 'new', 'demo_lead_004', null, null,
    null, null, 'website', 'organic', 'direct',
    '{"first_name": "Sophie", "last_name": "Bernard", "phone": "0612345678", "email": "sophie.bernard@email.fr", "city": "Lyon"}'::jsonb,
    now() - interval '30 minutes'
  )
  ON CONFLICT (meta_lead_id) DO NOTHING
  RETURNING id INTO v_lead_id;
  IF v_lead_id IS NOT NULL THEN v_count := v_count + 1; END IF;

  -- Demo lead 5
  INSERT INTO leads (
    workspace_id, first_name, last_name, phone, email, city,
    vehicle_registration, vehicle_make, vehicle_model,
    source, status, meta_lead_id, meta_page_id, meta_form_id,
    meta_campaign_id, meta_ad_id, utm_source, utm_medium, utm_campaign,
    raw_payload, received_at
  ) VALUES (
    p_workspace_id, 'Thomas', 'Leroy', '0645678901', 'thomas.leroy@email.fr', 'Bordeaux',
    'QR-345-ST', 'Toyota', 'Yaris',
    'meta', 'scheduled', 'demo_lead_005', 'demo_page_001', 'demo_form_002',
    'demo_campaign_002', 'demo_ad_004', 'facebook', 'social', 'vitrage_bordeaux',
    '{"field_data": [{"name": "first_name", "values": ["Thomas"]}, {"name": "last_name", "values": ["Leroy"]}, {"name": "phone", "values": ["0645678901"]}, {"name": "email", "values": ["thomas.leroy@email.fr"]}, {"name": "city", "values": ["Bordeaux"]}]}'::jsonb,
    now() - interval '2 days'
  )
  ON CONFLICT (meta_lead_id) DO NOTHING
  RETURNING id INTO v_lead_id;
  IF v_lead_id IS NOT NULL THEN v_count := v_count + 1; END IF;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION seed_demo_leads FROM anon;

-- ---------------------------------------------------------------------
-- 20260827104653_create_crm_core_tables.sql
-- ---------------------------------------------------------------------

/*
# Create CRM core tables for Relais Pare-Brise

1. New Tables
- contacts: Carnet de contacts clients (lien optionnel vers leads)
- vehicles: Véhicules liés à un contact
- insurers: Compagnies d'assurance
- windscreen_cases: Dossiers vitrage complets
- case_documents: Documents/pieces du dossier avec checklist
- appointments: Rendez-vous et interventions
- tasks: Tâches et relances
- notes: Notes internes sur leads/dossiers/contacts
- activities: Journal d'activité global
- communications: SMS, appels, emails
- sms_templates: Modèles de SMS réutilisables
- notifications: Notifications in-app
- workflows: Scénarios d'automatisation
- workflow_runs: Historique d'exécution des scénarios
- campaigns: Campagnes SMS/marketing
- quotes: Devis
- invoices: Factures
- payments: Paiements reçus
- gifts: Cadeaux/virements commerciaux
- after_sales_cases: Dossiers SAV

2. Modified Tables
- leads: Ajout des colonnes insurance, offer, score, next_action_at, campaign_name, advisor_notes, duplicate_flagged

3. Security
- RLS activée sur toutes les nouvelles tables
- Politiques workspace-scoped pour les membres
- Politiques admin-only pour certaines opérations sensibles

4. Notes
- Toutes les tables utilisent workspace_id pour l'isolation multi-tenant
- updated_at trigger ajouté pour les nouvelles tables
- Index créés sur les colonnes fréquemment filtrées
*/

-- ============ CONTACTS ============
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  phone text,
  email text,
  address text,
  city text,
  postal_code text,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  notes text,
  sms_consent boolean DEFAULT false,
  email_consent boolean DEFAULT false,
  unsubscribed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS contacts_workspace_id_idx ON contacts (workspace_id);
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts (phone);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts (email);
CREATE INDEX IF NOT EXISTS contacts_lead_id_idx ON contacts (lead_id);

DROP POLICY IF EXISTS "select_contacts" ON contacts;
CREATE POLICY "select_contacts" ON contacts FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_contacts" ON contacts;
CREATE POLICY "insert_contacts" ON contacts FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_contacts" ON contacts;
CREATE POLICY "update_contacts" ON contacts FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_contacts" ON contacts;
CREATE POLICY "delete_contacts" ON contacts FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ VEHICLES ============
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  make text,
  model text,
  year integer,
  registration text,
  vin text,
  color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS vehicles_workspace_id_idx ON vehicles (workspace_id);
CREATE INDEX IF NOT EXISTS vehicles_contact_id_idx ON vehicles (contact_id);
CREATE INDEX IF NOT EXISTS vehicles_registration_idx ON vehicles (registration);

DROP POLICY IF EXISTS "select_vehicles" ON vehicles;
CREATE POLICY "select_vehicles" ON vehicles FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_vehicles" ON vehicles;
CREATE POLICY "insert_vehicles" ON vehicles FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_vehicles" ON vehicles;
CREATE POLICY "update_vehicles" ON vehicles FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_vehicles" ON vehicles;
CREATE POLICY "delete_vehicles" ON vehicles FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ INSURERS ============
CREATE TABLE IF NOT EXISTS insurers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE insurers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS insurers_workspace_id_idx ON insurers (workspace_id);

DROP POLICY IF EXISTS "select_insurers" ON insurers;
CREATE POLICY "select_insurers" ON insurers FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_insurers" ON insurers;
CREATE POLICY "insert_insurers" ON insurers FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_insurers" ON insurers;
CREATE POLICY "update_insurers" ON insurers FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_insurers" ON insurers;
CREATE POLICY "delete_insurers" ON insurers FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ WINDSCREEN_CASES ============
CREATE TABLE IF NOT EXISTS windscreen_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_number text NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  insurer_id uuid REFERENCES insurers(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'qualification', 'documents_pending', 'insurance_declaration',
    'glass_ordered', 'appointment_scheduled', 'intervention_done',
    'invoice_sent', 'payment_pending', 'payment_received', 'gift_given',
    'sav', 'completed'
  )),
  intervention_address text,
  intervention_type text CHECK (intervention_type IN ('home', 'workshop')),
  appointment_date timestamptz,
  glass_type text,
  has_sensors boolean DEFAULT false,
  has_adas_camera boolean DEFAULT false,
  insurance_contract_number text,
  insurance_claim_number text,
  franchise_amount numeric(10,2) DEFAULT 0,
  offer text,
  gift_type text,
  gift_amount numeric(10,2) DEFAULT 0,
  estimated_margin numeric(10,2) DEFAULT 0,
  internal_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE windscreen_cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS windscreen_cases_workspace_id_idx ON windscreen_cases (workspace_id);
CREATE INDEX IF NOT EXISTS windscreen_cases_status_idx ON windscreen_cases (status);
CREATE INDEX IF NOT EXISTS windscreen_cases_lead_id_idx ON windscreen_cases (lead_id);
CREATE INDEX IF NOT EXISTS windscreen_cases_contact_id_idx ON windscreen_cases (contact_id);
CREATE INDEX IF NOT EXISTS windscreen_cases_assigned_user_id_idx ON windscreen_cases (assigned_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS windscreen_cases_case_number_unique ON windscreen_cases (workspace_id, case_number);

DROP POLICY IF EXISTS "select_windscreen_cases" ON windscreen_cases;
CREATE POLICY "select_windscreen_cases" ON windscreen_cases FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_windscreen_cases" ON windscreen_cases;
CREATE POLICY "insert_windscreen_cases" ON windscreen_cases FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_windscreen_cases" ON windscreen_cases;
CREATE POLICY "update_windscreen_cases" ON windscreen_cases FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_windscreen_cases" ON windscreen_cases;
CREATE POLICY "delete_windscreen_cases" ON windscreen_cases FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ CASE_DOCUMENTS ============
CREATE TABLE IF NOT EXISTS case_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES windscreen_cases(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'registration', 'insurance_cert', 'photo_before', 'photo_windscreen',
    'claim_declaration', 'assignment_signed', 'quote', 'invoice',
    'payment_proof', 'gift_proof'
  )),
  label text NOT NULL,
  uploaded boolean DEFAULT false,
  file_url text,
  uploaded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS case_documents_workspace_id_idx ON case_documents (workspace_id);
CREATE INDEX IF NOT EXISTS case_documents_case_id_idx ON case_documents (case_id);

DROP POLICY IF EXISTS "select_case_documents" ON case_documents;
CREATE POLICY "select_case_documents" ON case_documents FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_case_documents" ON case_documents;
CREATE POLICY "insert_case_documents" ON case_documents FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_case_documents" ON case_documents;
CREATE POLICY "update_case_documents" ON case_documents FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_case_documents" ON case_documents;
CREATE POLICY "delete_case_documents" ON case_documents FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ APPOINTMENTS ============
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  address text,
  type text DEFAULT 'intervention' CHECK (type IN ('intervention', 'call', 'meeting', 'other')),
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS appointments_workspace_id_idx ON appointments (workspace_id);
CREATE INDEX IF NOT EXISTS appointments_start_time_idx ON appointments (start_time);
CREATE INDEX IF NOT EXISTS appointments_assigned_user_id_idx ON appointments (assigned_user_id);
CREATE INDEX IF NOT EXISTS appointments_case_id_idx ON appointments (case_id);
CREATE INDEX IF NOT EXISTS appointments_status_idx ON appointments (status);

DROP POLICY IF EXISTS "select_appointments" ON appointments;
CREATE POLICY "select_appointments" ON appointments FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_appointments" ON appointments;
CREATE POLICY "insert_appointments" ON appointments FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_appointments" ON appointments;
CREATE POLICY "update_appointments" ON appointments FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_appointments" ON appointments;
CREATE POLICY "delete_appointments" ON appointments FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ TASKS ============
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  type text DEFAULT 'call' CHECK (type IN ('call', 'sms', 'email', 'follow_up', 'document', 'other')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tasks_workspace_id_idx ON tasks (workspace_id);
CREATE INDEX IF NOT EXISTS tasks_assigned_user_id_idx ON tasks (assigned_user_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON tasks (due_at);
CREATE INDEX IF NOT EXISTS tasks_lead_id_idx ON tasks (lead_id);
CREATE INDEX IF NOT EXISTS tasks_case_id_idx ON tasks (case_id);

DROP POLICY IF EXISTS "select_tasks" ON tasks;
CREATE POLICY "select_tasks" ON tasks FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_tasks" ON tasks;
CREATE POLICY "insert_tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_tasks" ON tasks;
CREATE POLICY "update_tasks" ON tasks FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_tasks" ON tasks;
CREATE POLICY "delete_tasks" ON tasks FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ NOTES ============
CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS notes_workspace_id_idx ON notes (workspace_id);
CREATE INDEX IF NOT EXISTS notes_lead_id_idx ON notes (lead_id);
CREATE INDEX IF NOT EXISTS notes_case_id_idx ON notes (case_id);

DROP POLICY IF EXISTS "select_notes" ON notes;
CREATE POLICY "select_notes" ON notes FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_notes" ON notes;
CREATE POLICY "insert_notes" ON notes FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_notes" ON notes;
CREATE POLICY "update_notes" ON notes FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_notes" ON notes;
CREATE POLICY "delete_notes" ON notes FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ ACTIVITIES ============
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS activities_workspace_id_idx ON activities (workspace_id);
CREATE INDEX IF NOT EXISTS activities_entity_type_idx ON activities (entity_type);
CREATE INDEX IF NOT EXISTS activities_created_at_idx ON activities (created_at DESC);

DROP POLICY IF EXISTS "select_activities" ON activities;
CREATE POLICY "select_activities" ON activities FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_activities" ON activities;
CREATE POLICY "insert_activities" ON activities FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ COMMUNICATIONS ============
CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('sms_outbound', 'sms_inbound', 'call_outbound', 'call_inbound', 'call_missed', 'voicemail', 'email_outbound', 'email_inbound', 'note')),
  direction text DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  status text DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'received', 'answered', 'missed', 'cancelled')),
  content text,
  subject text,
  duration_seconds integer,
  recording_url text,
  provider text DEFAULT 'demo',
  external_id text,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS communications_workspace_id_idx ON communications (workspace_id);
CREATE INDEX IF NOT EXISTS communications_lead_id_idx ON communications (lead_id);
CREATE INDEX IF NOT EXISTS communications_case_id_idx ON communications (case_id);
CREATE INDEX IF NOT EXISTS communications_type_idx ON communications (type);
CREATE INDEX IF NOT EXISTS communications_created_at_idx ON communications (created_at DESC);

DROP POLICY IF EXISTS "select_communications" ON communications;
CREATE POLICY "select_communications" ON communications FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_communications" ON communications;
CREATE POLICY "insert_communications" ON communications FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_communications" ON communications;
CREATE POLICY "update_communications" ON communications FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_communications" ON communications;
CREATE POLICY "delete_communications" ON communications FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ SMS_TEMPLATES ============
CREATE TABLE IF NOT EXISTS sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sms_templates_workspace_id_idx ON sms_templates (workspace_id);

DROP POLICY IF EXISTS "select_sms_templates" ON sms_templates;
CREATE POLICY "select_sms_templates" ON sms_templates FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_sms_templates" ON sms_templates;
CREATE POLICY "insert_sms_templates" ON sms_templates FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_sms_templates" ON sms_templates;
CREATE POLICY "update_sms_templates" ON sms_templates FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_sms_templates" ON sms_templates;
CREATE POLICY "delete_sms_templates" ON sms_templates FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text DEFAULT 'info',
  read boolean DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS notifications_workspace_id_idx ON notifications (workspace_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications (read);

DROP POLICY IF EXISTS "select_notifications" ON notifications;
CREATE POLICY "select_notifications" ON notifications FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_notifications" ON notifications;
CREATE POLICY "update_notifications" ON notifications FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_notifications" ON notifications;
CREATE POLICY "delete_notifications" ON notifications FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ WORKFLOWS ============
CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_config jsonb DEFAULT '{}'::jsonb,
  conditions jsonb DEFAULT '[]'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  flow_data jsonb DEFAULT '{}'::jsonb,
  enabled boolean DEFAULT true,
  success_count integer DEFAULT 0,
  failure_count integer DEFAULT 0,
  last_run_at timestamptz,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS workflows_workspace_id_idx ON workflows (workspace_id);
CREATE INDEX IF NOT EXISTS workflows_enabled_idx ON workflows (enabled);

DROP POLICY IF EXISTS "select_workflows" ON workflows;
CREATE POLICY "select_workflows" ON workflows FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_workflows" ON workflows;
CREATE POLICY "insert_workflows" ON workflows FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_workflows" ON workflows;
CREATE POLICY "update_workflows" ON workflows FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_workflows" ON workflows;
CREATE POLICY "delete_workflows" ON workflows FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ WORKFLOW_RUNS ============
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'retry')),
  error_message text,
  execution_log jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS workflow_runs_workspace_id_idx ON workflow_runs (workspace_id);
CREATE INDEX IF NOT EXISTS workflow_runs_workflow_id_idx ON workflow_runs (workflow_id);
CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs (status);

DROP POLICY IF EXISTS "select_workflow_runs" ON workflow_runs;
CREATE POLICY "select_workflow_runs" ON workflow_runs FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_workflow_runs" ON workflow_runs;
CREATE POLICY "insert_workflow_runs" ON workflow_runs FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_workflow_runs" ON workflow_runs;
CREATE POLICY "update_workflow_runs" ON workflow_runs FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ CAMPAIGNS ============
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel text DEFAULT 'sms' CHECK (channel IN ('sms', 'email')),
  template_id uuid REFERENCES sms_templates(id) ON DELETE SET NULL,
  audience_filter jsonb DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  reply_count integer DEFAULT 0,
  conversion_count integer DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS campaigns_workspace_id_idx ON campaigns (workspace_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status);

DROP POLICY IF EXISTS "select_campaigns" ON campaigns;
CREATE POLICY "select_campaigns" ON campaigns FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_campaigns" ON campaigns;
CREATE POLICY "insert_campaigns" ON campaigns FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_campaigns" ON campaigns;
CREATE POLICY "update_campaigns" ON campaigns FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_campaigns" ON campaigns;
CREATE POLICY "delete_campaigns" ON campaigns FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ QUOTES ============
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  quote_number text NOT NULL,
  amount_ht numeric(10,2) DEFAULT 0,
  tva_rate numeric(5,2) DEFAULT 20.0,
  amount_ttc numeric(10,2) DEFAULT 0,
  franchise_amount numeric(10,2) DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS quotes_workspace_id_idx ON quotes (workspace_id);
CREATE INDEX IF NOT EXISTS quotes_case_id_idx ON quotes (case_id);
CREATE UNIQUE INDEX IF NOT EXISTS quotes_quote_number_unique ON quotes (workspace_id, quote_number);

DROP POLICY IF EXISTS "select_quotes" ON quotes;
CREATE POLICY "select_quotes" ON quotes FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_quotes" ON quotes;
CREATE POLICY "insert_quotes" ON quotes FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_quotes" ON quotes;
CREATE POLICY "update_quotes" ON quotes FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_quotes" ON quotes;
CREATE POLICY "delete_quotes" ON quotes FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ INVOICES ============
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  amount_ht numeric(10,2) DEFAULT 0,
  tva_rate numeric(5,2) DEFAULT 20.0,
  amount_ttc numeric(10,2) DEFAULT 0,
  franchise_amount numeric(10,2) DEFAULT 0,
  insurance_amount numeric(10,2) DEFAULT 0,
  gift_amount numeric(10,2) DEFAULT 0,
  estimated_margin numeric(10,2) DEFAULT 0,
  amount_paid numeric(10,2) DEFAULT 0,
  remaining_amount numeric(10,2) DEFAULT 0,
  issue_date timestamptz DEFAULT now(),
  due_date timestamptz,
  payment_date timestamptz,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS invoices_workspace_id_idx ON invoices (workspace_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
CREATE INDEX IF NOT EXISTS invoices_case_id_idx ON invoices (case_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_unique ON invoices (workspace_id, invoice_number);

DROP POLICY IF EXISTS "select_invoices" ON invoices;
CREATE POLICY "select_invoices" ON invoices FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_invoices" ON invoices;
CREATE POLICY "insert_invoices" ON invoices FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_invoices" ON invoices;
CREATE POLICY "update_invoices" ON invoices FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_invoices" ON invoices;
CREATE POLICY "delete_invoices" ON invoices FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ PAYMENTS ============
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'check', 'cash', 'card', 'other')),
  payment_date timestamptz DEFAULT now(),
  reference text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payments_workspace_id_idx ON payments (workspace_id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments (invoice_id);

DROP POLICY IF EXISTS "select_payments" ON payments;
CREATE POLICY "select_payments" ON payments FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_payments" ON payments;
CREATE POLICY "insert_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_payments" ON payments;
CREATE POLICY "update_payments" ON payments FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_payments" ON payments;
CREATE POLICY "delete_payments" ON payments FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ GIFTS ============
CREATE TABLE IF NOT EXISTS gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  type text DEFAULT 'gift' CHECK (type IN ('gift', 'transfer')),
  description text,
  amount numeric(10,2) DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'given', 'cancelled')),
  given_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS gifts_workspace_id_idx ON gifts (workspace_id);
CREATE INDEX IF NOT EXISTS gifts_case_id_idx ON gifts (case_id);
CREATE INDEX IF NOT EXISTS gifts_status_idx ON gifts (status);

DROP POLICY IF EXISTS "select_gifts" ON gifts;
CREATE POLICY "select_gifts" ON gifts FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_gifts" ON gifts;
CREATE POLICY "insert_gifts" ON gifts FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_gifts" ON gifts;
CREATE POLICY "update_gifts" ON gifts FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_gifts" ON gifts;
CREATE POLICY "delete_gifts" ON gifts FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ AFTER_SALES_CASES ============
CREATE TABLE IF NOT EXISTS after_sales_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid REFERENCES windscreen_cases(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  reason text,
  description text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE after_sales_cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS after_sales_cases_workspace_id_idx ON after_sales_cases (workspace_id);
CREATE INDEX IF NOT EXISTS after_sales_cases_status_idx ON after_sales_cases (status);
CREATE INDEX IF NOT EXISTS after_sales_cases_case_id_idx ON after_sales_cases (case_id);

DROP POLICY IF EXISTS "select_after_sales_cases" ON after_sales_cases;
CREATE POLICY "select_after_sales_cases" ON after_sales_cases FOR SELECT
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "insert_after_sales_cases" ON after_sales_cases;
CREATE POLICY "insert_after_sales_cases" ON after_sales_cases FOR INSERT
  TO authenticated WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "update_after_sales_cases" ON after_sales_cases;
CREATE POLICY "update_after_sales_cases" ON after_sales_cases FOR UPDATE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "delete_after_sales_cases" ON after_sales_cases;
CREATE POLICY "delete_after_sales_cases" ON after_sales_cases FOR DELETE
  TO authenticated USING (
    workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ ADD COLUMNS TO LEADS ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'insurance') THEN
    ALTER TABLE leads ADD COLUMN insurance text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'offer') THEN
    ALTER TABLE leads ADD COLUMN offer text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'score') THEN
    ALTER TABLE leads ADD COLUMN score integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'next_action_at') THEN
    ALTER TABLE leads ADD COLUMN next_action_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'campaign_name') THEN
    ALTER TABLE leads ADD COLUMN campaign_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'advisor_notes') THEN
    ALTER TABLE leads ADD COLUMN advisor_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'duplicate_flagged') THEN
    ALTER TABLE leads ADD COLUMN duplicate_flagged boolean DEFAULT false;
  END IF;
END $$;

-- Update leads status constraint to include new statuses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'leads_status_check' AND table_name = 'leads') THEN
    ALTER TABLE leads DROP CONSTRAINT leads_status_check;
  END IF;
END $$;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'new', 'to_call', 'calling', 'nrp', 'interested', 'documents_requested',
  'documents_received', 'appointment_scheduled', 'lost', 'converted'
));

-- ============ UPDATED_AT TRIGGERS ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'contacts_updated_at') THEN
    CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vehicles_updated_at') THEN
    CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON vehicles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'insurers_updated_at') THEN
    CREATE TRIGGER insurers_updated_at BEFORE UPDATE ON insurers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'windscreen_cases_updated_at') THEN
    CREATE TRIGGER windscreen_cases_updated_at BEFORE UPDATE ON windscreen_cases
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'case_documents_updated_at') THEN
    CREATE TRIGGER case_documents_updated_at BEFORE UPDATE ON case_documents
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'appointments_updated_at') THEN
    CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tasks_updated_at') THEN
    CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notes_updated_at') THEN
    CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sms_templates_updated_at') THEN
    CREATE TRIGGER sms_templates_updated_at BEFORE UPDATE ON sms_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'workflows_updated_at') THEN
    CREATE TRIGGER workflows_updated_at BEFORE UPDATE ON workflows
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campaigns_updated_at') THEN
    CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'quotes_updated_at') THEN
    CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON quotes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'invoices_updated_at') THEN
    CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gifts_updated_at') THEN
    CREATE TRIGGER gifts_updated_at BEFORE UPDATE ON gifts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_sales_cases_updated_at') THEN
    CREATE TRIGGER after_sales_cases_updated_at BEFORE UPDATE ON after_sales_cases
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 20260827113142_fix_rls_recursion.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260827160000_add_signup_trigger.sql
-- ---------------------------------------------------------------------

/*
# Création automatique du profil et du workspace à l'inscription

## Problème résolu

`auth-context.tsx` crée le workspace puis le profil côté client, juste après
`supabase.auth.signUp()`. Ces deux écritures n'aboutissent que si signUp a
renvoyé une session.

Quand la confirmation d'e-mail est activée (réglage par défaut de Supabase),
signUp renvoie un utilisateur mais aucune session. Les deux écritures partent
alors en tant qu'`anon` et la RLS les rejette. L'erreur est avalée par un
console.error.

Le compte existe donc sans profil. `get_workspace_id()` renvoie NULL, toutes
les politiques RLS échouent, et le CRM s'affiche entièrement vide sans le
moindre message d'erreur.

## Solution

Un trigger SECURITY DEFINER sur auth.users, qui s'exécute hors RLS au moment
même de la création du compte. L'inscription fonctionne alors que la
confirmation d'e-mail soit activée ou non.

Le code client reste en place : son upsert devient simplement redondant.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
  is_first boolean;
BEGIN
  SELECT id INTO ws_id FROM public.workspaces ORDER BY created_at LIMIT 1;

  IF ws_id IS NULL THEN
    INSERT INTO public.workspaces (name, slug)
    VALUES ('Relais Pare-Brise', 'relais-pare-brise')
    RETURNING id INTO ws_id;
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;

  INSERT INTO public.profiles (id, workspace_id, first_name, last_name, role)
  VALUES (
    NEW.id,
    ws_id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    CASE WHEN is_first THEN 'admin' ELSE 'advisor' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Ne jamais faire echouer la creation du compte si le profil pose probleme
    RAISE WARNING 'handle_new_user a echoue pour %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
