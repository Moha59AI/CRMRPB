-- =====================================================================
-- Relais Pare-Brise CRM -- installation complete de la base de donnees
-- =====================================================================
-- Concatenation des 15 migrations, dans l'ordre chronologique.
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

-- ---------------------------------------------------------------------
-- 20260828100000_add_meta_lead_queue.sql
-- ---------------------------------------------------------------------

/*
# File d'attente des leads Meta

## Problème résolu

`meta-lead-webhook` appelait l'API Graph de façon synchrone, à l'intérieur du
handler, avant de répondre à Meta. Meta impose une réponse en moins de 20
secondes : un appel Graph lent, un token expiré, ou simplement plusieurs leads
dans un même payload suffisaient à dépasser le délai. Meta considère alors la
livraison en échec et rejoue l'événement — d'où des doublons et du retard.

## Solution

Le webhook se contente désormais d'empiler les `leadgen_id` et répond 200
immédiatement. Un worker (`meta-process-queue`), déclenché chaque minute par
pg_cron, dépile et appelle l'API Graph hors du chemin critique.

`webhook_events` sert de file : `processing_status` porte l'état et
`processing_attempts` le compteur de tentatives. On y ajoute `next_attempt_at`
pour le backoff exponentiel sur 429 et sur token expiré.
*/

-- Colonne de backoff
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now();

-- Dédoublonnage préalable (l'index unique ci-dessous échouerait sinon)
DELETE FROM webhook_events a
USING webhook_events b
WHERE a.ctid < b.ctid
  AND a.workspace_id = b.workspace_id
  AND a.provider = b.provider
  AND a.external_event_id = b.external_event_id
  AND a.external_event_id IS NOT NULL;

-- Idempotence : Meta renvoie parfois deux fois le même leadgen_id.
-- L'unicité est garantie par la base, pas par un SELECT préalable
-- (qui laisse une fenêtre de concurrence entre deux livraisons simultanées).
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_external_id_uniq
  ON webhook_events (workspace_id, provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- Index de dépilement
CREATE INDEX IF NOT EXISTS webhook_events_queue_idx
  ON webhook_events (processing_status, next_attempt_at);

-- ---------------------------------------------------------------------
-- 20260828140000_add_vault_helpers.sql
-- ---------------------------------------------------------------------

/*
# Fonctions d'acces au Vault

## Probleme resolu

Les Edge Functions Meta appellent trois RPC pour manipuler les secrets :

  - vault_create_secret(new_secret_name, new_secret)
  - vault_update_secret(secret_name, new_secret)
  - vault_read_secret(secret_name)

Aucune des trois n'existait en base : aucune migration ne les creait.
L'ecriture des secrets echouait donc silencieusement (meta-store-secrets
se contentait d'un console.error) et la lecture renvoyait toujours null.

Consequence : l'app secret et le page access token n'etaient jamais stockes,
la verification de signature Meta ne pouvait pas aboutir et l'appel a l'API
Graph n'avait aucun token. Aucun lead n'aurait jamais pu arriver, sans le
moindre message d'erreur cote interface.

## Securite

Ces fonctions sont SECURITY DEFINER : elles accedent au Vault, ce que
l'appelant ne peut pas faire directement. L'execution est donc revoquee pour
anon et authenticated, et accordee au seul service_role -- sans quoi
n'importe quel utilisateur connecte pourrait lire les secrets de l'atelier.
*/

create extension if not exists supabase_vault with schema vault;


-- ============ CREATION ============
create or replace function public.vault_create_secret(
  new_secret_name text,
  new_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_id uuid;
begin
  select vault.create_secret(new_secret, new_secret_name) into v_id;
  return v_id;
end;
$$;


-- ============ MISE A JOUR ============
-- Cree le secret s'il n'existe pas encore : meta-store-secrets appelle
-- update en repli quand create echoue, il faut que ce chemin aboutisse.
create or replace function public.vault_update_secret(
  secret_name text,
  new_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = secret_name limit 1;

  if v_id is null then
    select vault.create_secret(new_secret, secret_name) into v_id;
  else
    perform vault.update_secret(v_id, new_secret, secret_name);
  end if;

  return v_id;
end;
$$;


-- ============ LECTURE ============
create or replace function public.vault_read_secret(secret_name text)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;

  return v_secret;
end;
$$;


-- ============ PERMISSIONS ============
revoke all on function public.vault_create_secret(text, text) from public, anon, authenticated;
revoke all on function public.vault_update_secret(text, text) from public, anon, authenticated;
revoke all on function public.vault_read_secret(text) from public, anon, authenticated;

grant execute on function public.vault_create_secret(text, text) to service_role;
grant execute on function public.vault_update_secret(text, text) to service_role;
grant execute on function public.vault_read_secret(text) to service_role;

-- ---------------------------------------------------------------------
-- 20260828160000_fix_webhook_events_unique_index.sql
-- ---------------------------------------------------------------------

/*
# Index d'unicite non partiel sur webhook_events

## Probleme resolu

La migration 20260828100000 creait l'index d'idempotence en partiel :

  create unique index ... on webhook_events (workspace_id, provider, external_event_id)
    where external_event_id is not null;

PostgreSQL ne peut pas inferer un index PARTIEL pour un ON CONFLICT : la
clause doit correspondre a un index total, ou a un index partiel dont le
predicat est implique par la requete -- ce que PostgREST ne produit pas.

L'upsert de meta-lead-webhook echouait donc systematiquement (SQLSTATE 42P10),
l'erreur etait avalee par un console.error, et la fonction repondait 200 sans
avoir rien insere. Aucun leadgen_id n'etait mis en file, meme avec une
signature parfaitement valide.

Le predicat etait de toute facon inutile : PostgreSQL considere deja chaque
NULL comme distinct dans un index unique, donc plusieurs lignes sans
external_event_id restent autorisees.
*/

drop index if exists webhook_events_external_id_uniq;

create unique index if not exists webhook_events_external_id_uniq
  on webhook_events (workspace_id, provider, external_event_id);

-- ---------------------------------------------------------------------
-- 20260830120000_relances_engine.sql
-- ---------------------------------------------------------------------

/*
# Moteur de relances côté base

## Problème résolu

La première version chargeait toutes les lignes de `leads`, `tasks` et
`appointments`, puis calculait l'urgence et triait en JavaScript. Tenable à
cinquante relances, inutilisable à mille : trois requêtes sans limite, un tri
côté client, et un DOM qui s'effondre.

Tout passe désormais en SQL : agrégation des sources, score de priorité,
filtrage, tri et pagination. Le client ne reçoit qu'une page de résultats.

## Sécurité

La vue est déclarée `security_invoker` : les politiques RLS des tables sources
s'appliquent à l'appelant. Sans cette option, la vue s'exécuterait avec les
droits de son propriétaire et exposerait les données de tous les workspaces.
*/

-- ============ INDEX ============
-- communications (lead_id, created_at desc) est le plus important : sans lui,
-- retrouver la dernière action de chaque lead déclenche un balayage par ligne.

create index if not exists leads_next_action_at_idx
  on leads (workspace_id, next_action_at);
create index if not exists leads_updated_at_idx
  on leads (workspace_id, updated_at);
create index if not exists communications_lead_created_idx
  on communications (lead_id, created_at desc);
create index if not exists tasks_due_at_idx
  on tasks (workspace_id, status, due_at);
create index if not exists appointments_start_idx
  on appointments (workspace_id, status, start_time);
create index if not exists windscreen_cases_status_idx
  on windscreen_cases (workspace_id, status, updated_at);
create index if not exists invoices_status_due_idx
  on invoices (workspace_id, status, due_date);


-- ============ COMPTEURS DÉNORMALISÉS ============
-- Déductibles de `communications`, mais les recalculer à chaque affichage
-- coûte un agrégat par ligne. On les maintient par trigger.

alter table leads add column if not exists attempt_count integer not null default 0;
alter table leads add column if not exists last_contacted_at timestamptz;

create or replace function public.maj_compteurs_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null then
    return new;
  end if;

  update leads
  set last_contacted_at = greatest(coalesce(last_contacted_at, new.created_at), new.created_at),
      attempt_count = attempt_count
        + case when new.direction = 'outbound' and new.type like 'call%' then 1 else 0 end
  where id = new.lead_id;

  return new;
end;
$$;

drop trigger if exists communications_maj_compteurs on communications;
create trigger communications_maj_compteurs
  after insert on communications
  for each row execute function public.maj_compteurs_lead();

-- Rattrapage sur l'existant
update leads l
set attempt_count = coalesce(c.tentatives, 0),
    last_contacted_at = c.dernier
from (
  select lead_id,
         count(*) filter (where direction = 'outbound' and type like 'call%') as tentatives,
         max(created_at) as dernier
  from communications
  where lead_id is not null
  group by lead_id
) c
where c.lead_id = l.id;


-- ============ SCORE DE PRIORITÉ ============
-- Calculé en base, jamais par appel externe. Les composantes sont exposées
-- pour pouvoir expliquer la priorité sans rien recalculer.

create or replace function public.calc_priorite_relance(
  p_jamais_appele boolean,
  p_jours_retard integer,
  p_rdv_proche boolean,
  p_docs_bloques boolean,
  p_assurance_bloquee boolean,
  p_valeur integer,
  p_tentatives integer,
  p_doublon boolean
)
returns integer
language sql
immutable
as $$
  select greatest(0,
      case when p_jamais_appele then 40 else 0 end
    + case when p_jours_retard > 0
           then least(25 + (p_jours_retard - 1) * 5, 40) else 0 end
    + case when p_rdv_proche then 20 else 0 end
    + case when p_docs_bloques then 15 else 0 end
    + case when p_assurance_bloquee then 15 else 0 end
    + case when coalesce(p_valeur, 0) >= 50 then 10 else 0 end
    + case when coalesce(p_tentatives, 0) >= 5 then -20 else 0 end
    + case when p_doublon then -30 else 0 end
  );
$$;

create or replace function public.niveau_priorite(p_score integer)
returns text
language sql
immutable
as $$
  select case
    when p_score >= 70 then 'urgent'
    when p_score >= 45 then 'haute'
    when p_score >= 20 then 'normale'
    else 'faible'
  end;
$$;


-- ============ VUE D'AGRÉGATION ============

drop view if exists public.v_relances;

create view public.v_relances
with (security_invoker = on)
as
-- Leads : délai par statut, sauf si next_action_at fixe une date explicite.
-- Une décision humaine prime toujours sur la règle.
with delais(statut, jours) as (
  values ('new', 0), ('to_call', 0), ('calling', 0), ('nrp', 1),
         ('interested', 1), ('documents_requested', 2), ('documents_received', 0)
),
derniere_action as (
  select distinct on (lead_id)
         lead_id, type, direction, created_at
  from communications
  where lead_id is not null
  order by lead_id, created_at desc
)
select
  'lead:' || l.id                                  as id,
  l.workspace_id,
  case when l.status = 'documents_requested' then 'documents' else 'rappel' end as kind,
  coalesce(l.next_action_at, l.updated_at + (d.jours || ' days')::interval) as due_at,
  trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')) as titre,
  case l.status
    when 'new' then 'Nouveau lead — jamais appelé'
    when 'to_call' then 'À appeler'
    when 'calling' then 'Appel en cours, à reprendre'
    when 'nrp' then 'N''a pas répondu'
    when 'interested' then 'Intéressé, à relancer'
    when 'documents_requested' then 'Documents demandés, sans réponse'
    when 'documents_received' then 'Documents reçus, à traiter'
    else 'À reprendre'
  end                                              as motif,
  l.phone, l.city, l.insurance,
  nullif(trim(coalesce(l.vehicle_make, '') || ' ' || coalesce(l.vehicle_model, '')), '') as vehicule,
  l.vehicle_registration                           as immatriculation,
  l.assigned_user_id,
  l.id                                             as lead_id,
  null::uuid                                       as task_id,
  null::uuid                                       as appointment_id,
  null::uuid                                       as case_id,
  null::uuid                                       as invoice_id,
  null::uuid                                       as sav_id,
  l.attempt_count,
  a.created_at                                     as last_action_at,
  a.type                                           as last_action_type,
  public.calc_priorite_relance(
    l.attempt_count = 0,
    greatest(0, (current_date - coalesce(l.next_action_at, l.updated_at + (d.jours || ' days')::interval)::date)),
    false,
    l.status = 'documents_requested' and l.updated_at < now() - interval '5 days',
    false,
    l.score,
    l.attempt_count,
    l.duplicate_flagged
  )                                                as score
from leads l
join delais d on d.statut = l.status
left join derniere_action a on a.lead_id = l.id

union all

-- Tâches
select
  'task:' || t.id, t.workspace_id, 'tache',
  t.due_at, t.title, coalesce(t.description, 'Tâche à traiter'),
  null, null, null, null, null,
  t.assigned_user_id, t.lead_id, t.id, null::uuid, t.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(
    false, greatest(0, current_date - t.due_at::date), false, false, false,
    case t.priority when 'urgent' then 60 when 'high' then 50 else 0 end, 0, false)
from tasks t
where t.status in ('pending', 'in_progress') and t.due_at is not null

union all

-- Rendez-vous : à confirmer la veille
select
  'rdv:' || ap.id, ap.workspace_id, 'rdv',
  ap.start_time - interval '1 day', ap.title, 'Rendez-vous à confirmer',
  null, null, null, null, null,
  ap.assigned_user_id, ap.lead_id, null::uuid, ap.id, ap.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (ap.start_time - interval '1 day')::date),
                               true, false, false, 0, 0, false)
from appointments ap
where ap.status = 'scheduled'

union all

-- Dossiers en attente de documents
select
  'case-doc:' || wc.id, wc.workspace_id, 'documents',
  wc.updated_at + interval '2 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), wc.case_number),
  'Documents manquants',
  co.phone, co.city, null, null, null,
  wc.assigned_user_id, wc.lead_id, null::uuid, null::uuid, wc.id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (wc.updated_at + interval '2 days')::date),
                               false, true, false, 0, 0, false)
from windscreen_cases wc
left join contacts co on co.id = wc.contact_id
where wc.status = 'documents_pending'

union all

-- Dossiers assurance sans mouvement depuis 7 jours
select
  'case-assur:' || wc.id, wc.workspace_id, 'assurance',
  wc.updated_at + interval '7 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), wc.case_number),
  'Assurance sans réponse depuis plus de 7 jours',
  co.phone, co.city, null, null, null,
  wc.assigned_user_id, wc.lead_id, null::uuid, null::uuid, wc.id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (wc.updated_at + interval '7 days')::date),
                               false, false, true, 0, 0, false)
from windscreen_cases wc
left join contacts co on co.id = wc.contact_id
where wc.status = 'insurance_declaration'

union all

-- Factures non réglées
select
  'invoice:' || i.id, i.workspace_id, 'impaye',
  coalesce(i.due_date::timestamptz, i.updated_at),
  coalesce(trim(co.first_name || ' ' || co.last_name), i.invoice_number),
  'Règlement en attente',
  co.phone, co.city, null, null, null,
  null::uuid, null::uuid, null::uuid, null::uuid, i.case_id, i.id, null::uuid,
  0, null::timestamptz, null::text,
  -- due_date est un timestamptz : sans le cast en date, la soustraction rend
  -- un interval et greatest() ne peut plus le comparer a 0.
  public.calc_priorite_relance(false, greatest(0, current_date - coalesce(i.due_date::date, current_date)),
                               false, false, false,
                               least(60, coalesce(i.remaining_amount, 0)::integer / 20), 0, false)
from invoices i
left join contacts co on co.id = i.contact_id
where i.status in ('sent', 'partial', 'overdue')

union all

-- SAV ouverts
select
  'sav:' || s.id, s.workspace_id, 'sav',
  s.created_at + interval '3 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), s.reason),
  'SAV ouvert',
  co.phone, co.city, null, null, null,
  null::uuid, null::uuid, null::uuid, null::uuid, s.case_id, null::uuid, s.id,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (s.created_at + interval '3 days')::date),
                               false, false, false, 0, 0, false)
from after_sales_cases s
left join contacts co on co.id = s.contact_id
-- 'resolved' et 'closed' sont terminaux : seuls les SAV encore actifs
-- appellent une relance.
where s.status in ('open', 'in_progress');


-- ============ LECTURE PAGINÉE ============

create or replace function public.fetch_relances(
  p_search        text default null,
  p_kinds         text[] default null,
  p_urgencies     text[] default null,
  p_priorities    text[] default null,
  p_assigned      uuid default null,
  p_city          text default null,
  p_sort          text default 'priorite',
  p_horizon_days  integer default 7,
  p_limit         integer default 50,
  p_offset        integer default 0
)
returns table (
  id text, kind text, urgency text, due_at timestamptz, days_late integer,
  score integer, priority_level text, titre text, motif text,
  phone text, city text, insurance text, vehicule text, immatriculation text,
  assigned_user_id uuid, lead_id uuid, task_id uuid, appointment_id uuid,
  case_id uuid, invoice_id uuid, sav_id uuid,
  attempt_count integer, last_action_at timestamptz, last_action_type text,
  total_count bigint
)
language sql
stable
as $$
  with filtre as (
    select v.*,
           case
             when v.due_at::date < current_date then 'urgent'
             when v.due_at::date = current_date then 'due'
             else 'upcoming'
           end as urgency_calc,
           greatest(0, current_date - v.due_at::date) as days_late_calc,
           public.niveau_priorite(v.score) as niveau
    from public.v_relances v
    where v.due_at::date <= current_date + p_horizon_days
  ),
  applique as (
    select * from filtre f
    where (p_kinds is null or f.kind = any(p_kinds))
      and (p_urgencies is null or f.urgency_calc = any(p_urgencies))
      and (p_priorities is null or f.niveau = any(p_priorities))
      and (p_assigned is null or f.assigned_user_id = p_assigned)
      and (p_city is null or f.city ilike '%' || p_city || '%')
      and (
        p_search is null or p_search = '' or
        f.titre ilike '%' || p_search || '%' or
        f.phone ilike '%' || p_search || '%' or
        f.immatriculation ilike '%' || p_search || '%'
      )
  )
  select
    a.id, a.kind, a.urgency_calc, a.due_at, a.days_late_calc,
    a.score, a.niveau, a.titre, a.motif,
    a.phone, a.city, a.insurance, a.vehicule, a.immatriculation,
    a.assigned_user_id, a.lead_id, a.task_id, a.appointment_id,
    a.case_id, a.invoice_id, a.sav_id,
    a.attempt_count, a.last_action_at, a.last_action_type,
    count(*) over () as total_count
  from applique a
  order by
    case when p_sort = 'priorite'    then a.score end desc nulls last,
    case when p_sort = 'plus_ancien' then a.due_at end asc,
    case when p_sort = 'plus_recent' then a.due_at end desc,
    a.due_at asc
  limit p_limit offset p_offset;
$$;


-- ============ COMPTEURS D'EN-TÊTE ============
-- Ne ramène jamais les lignes : uniquement des agrégats.

create or replace function public.compter_relances(p_horizon_days integer default 7)
returns jsonb
language sql
stable
as $$
  with base as (
    select v.kind,
           case
             when v.due_at::date < current_date then 'urgent'
             when v.due_at::date = current_date then 'due'
             else 'upcoming'
           end as urgency
    from public.v_relances v
    where v.due_at::date <= current_date + p_horizon_days
  )
  select jsonb_build_object(
    'total',     (select count(*) from base),
    'urgent',    (select count(*) from base where urgency = 'urgent'),
    'due',       (select count(*) from base where urgency = 'due'),
    'upcoming',  (select count(*) from base where urgency = 'upcoming'),
    'rappel',    (select count(*) from base where kind = 'rappel'),
    'documents', (select count(*) from base where kind = 'documents'),
    'assurance', (select count(*) from base where kind = 'assurance'),
    'rdv',       (select count(*) from base where kind = 'rdv'),
    'impaye',    (select count(*) from base where kind = 'impaye'),
    'sav',       (select count(*) from base where kind = 'sav'),
    'tache',     (select count(*) from base where kind = 'tache')
  );
$$;

grant execute on function public.fetch_relances(text, text[], text[], text[], uuid, text, text, integer, integer, integer) to authenticated;
grant execute on function public.compter_relances(integer) to authenticated;
grant select on public.v_relances to authenticated;

-- ---------------------------------------------------------------------
-- 20260830150000_relances_premier_contact.sql
-- ---------------------------------------------------------------------

/*
# Délai de premier contact et cadence de rappel

## Ce que ça corrige

Un lead arrivé il y a trois minutes et un lead arrivé ce matin à 8 h avaient la
même urgence : « aujourd'hui ». La journée était l'unité la plus fine, alors que
sur un lead publicitaire tout se joue dans le premier quart d'heure.

Deux changements :

1. **Granularité minute pour les leads jamais appelés.** Le score monte avec
   l'attente : au-delà de deux heures, un lead jamais appelé passe devant tout
   le reste. La vue expose `waiting_minutes` pour que l'interface puisse
   afficher « il y a 12 min ».

2. **Cadence de rappel après un NRP.** Le délai fixe de 24 h ignorait le nombre
   de tentatives déjà faites. La cadence suit désormais `attempt_count` :

   | Tentatives | Rappel dans |
   |---|---|
   | 1 | 2 heures |
   | 2 | 1 jour |
   | 3 | 3 jours |
   | 4 | 7 jours |
   | 5 et plus | sort de la file |

   Rappeler indéfiniment un numéro qui ne répond pas encombre la file et fait
   perdre du temps ; cinq tentatives espacées suffisent à trancher.
*/

drop view if exists public.v_relances;

create view public.v_relances
with (security_invoker = on)
as
with derniere_action as (
  select distinct on (lead_id) lead_id, type, direction, created_at
  from communications
  where lead_id is not null
  order by lead_id, created_at desc
),
leads_relances as (
  select
    l.*,
    coalesce(l.last_contacted_at, l.received_at, l.created_at) as depart,
    case l.status
      when 'new'                 then interval '0 minutes'
      when 'to_call'             then interval '0 minutes'
      when 'calling'             then interval '0 minutes'
      when 'documents_received'  then interval '0 minutes'
      when 'interested'          then interval '1 day'
      when 'documents_requested' then interval '2 days'
      when 'nrp' then case
        when l.attempt_count <= 1 then interval '2 hours'
        when l.attempt_count = 2  then interval '1 day'
        when l.attempt_count = 3  then interval '3 days'
        when l.attempt_count = 4  then interval '7 days'
        else null
      end
      else null
    end as delai
  from leads l
)
select
  'lead:' || lr.id as id,
  lr.workspace_id,
  case
    when lr.status = 'documents_requested' then 'documents'
    when lr.attempt_count = 0 then 'nouveau'
    else 'rappel'
  end as kind,
  coalesce(lr.next_action_at, lr.depart + lr.delai) as due_at,
  trim(coalesce(lr.first_name, '') || ' ' || coalesce(lr.last_name, '')) as titre,
  case lr.status
    when 'new' then 'Nouveau lead — jamais appelé'
    when 'to_call' then 'À appeler'
    when 'calling' then 'Appel en cours, à reprendre'
    when 'nrp' then 'Sans réponse — tentative ' || (lr.attempt_count + 1)
    when 'interested' then 'Intéressé, à relancer'
    when 'documents_requested' then 'Documents demandés, sans réponse'
    when 'documents_received' then 'Documents reçus, à traiter'
    else 'À reprendre'
  end as motif,
  lr.phone, lr.city, lr.insurance,
  nullif(trim(coalesce(lr.vehicle_make, '') || ' ' || coalesce(lr.vehicle_model, '')), '') as vehicule,
  lr.vehicle_registration as immatriculation,
  lr.assigned_user_id,
  lr.id as lead_id,
  null::uuid as task_id, null::uuid as appointment_id, null::uuid as case_id,
  null::uuid as invoice_id, null::uuid as sav_id,
  lr.attempt_count,
  a.created_at as last_action_at,
  a.type as last_action_type,
  case when lr.attempt_count = 0
       then greatest(0, extract(epoch from (now() - lr.depart)) / 60)::integer
       else null end as waiting_minutes,
  public.calc_priorite_relance(
    lr.attempt_count = 0,
    greatest(0, current_date - coalesce(lr.next_action_at, lr.depart + lr.delai)::date),
    false,
    lr.status = 'documents_requested' and lr.updated_at < now() - interval '5 days',
    false, lr.score, lr.attempt_count, lr.duplicate_flagged
  )
  + case
      when lr.attempt_count > 0 then 0
      when now() - lr.depart > interval '2 hours'    then 30
      when now() - lr.depart > interval '30 minutes' then 20
      when now() - lr.depart > interval '5 minutes'  then 10
      else 0
    end as score
from leads_relances lr
left join derniere_action a on a.lead_id = lr.id
where lr.delai is not null

union all

select
  'task:' || t.id, t.workspace_id, 'tache', t.due_at, t.title,
  coalesce(t.description, 'Tâche à traiter'),
  null, null, null, null, null,
  t.assigned_user_id, t.lead_id, t.id, null::uuid, t.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text, null::integer,
  public.calc_priorite_relance(
    false, greatest(0, current_date - t.due_at::date), false, false, false,
    case t.priority when 'urgent' then 60 when 'high' then 50 else 0 end, 0, false)
from tasks t
where t.status in ('pending', 'in_progress') and t.due_at is not null

union all

select
  'rdv:' || ap.id, ap.workspace_id, 'rdv',
  ap.start_time - interval '1 day', ap.title, 'Rendez-vous à confirmer',
  null, null, null, null, null,
  ap.assigned_user_id, ap.lead_id, null::uuid, ap.id, ap.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text, null::integer,
  public.calc_priorite_relance(false, greatest(0, current_date - (ap.start_time - interval '1 day')::date),
                               true, false, false, 0, 0, false)
from appointments ap
where ap.status = 'scheduled'

union all

select
  'case-doc:' || wc.id, wc.workspace_id, 'documents',
  wc.updated_at + interval '2 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), wc.case_number),
  'Documents manquants',
  co.phone, co.city, null, null, null,
  wc.assigned_user_id, wc.lead_id, null::uuid, null::uuid, wc.id, null::uuid, null::uuid,
  0, null::timestamptz, null::text, null::integer,
  public.calc_priorite_relance(false, greatest(0, current_date - (wc.updated_at + interval '2 days')::date),
                               false, true, false, 0, 0, false)
from windscreen_cases wc
left join contacts co on co.id = wc.contact_id
where wc.status = 'documents_pending';


-- ============ LECTURE ============
-- `waiting_minutes` s'ajoute au contrat ; l'urgence des leads jamais appelés
-- se calcule désormais en minutes, pas en jours.
--
-- La signature de retour change : PostgreSQL refuse un CREATE OR REPLACE qui
-- modifie le type de retour, il faut donc supprimer la fonction d'abord.

drop function if exists public.fetch_relances(text, text[], text[], text[], uuid, text, text, integer, integer, integer);

create function public.fetch_relances(
  p_search text default null,
  p_kinds text[] default null,
  p_urgencies text[] default null,
  p_priorities text[] default null,
  p_assigned uuid default null,
  p_city text default null,
  p_sort text default 'priorite',
  p_horizon_days integer default 7,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id text, kind text, urgency text, due_at timestamptz, days_late integer,
  waiting_minutes integer, score integer, priority_level text, titre text, motif text,
  phone text, city text, insurance text, vehicule text, immatriculation text,
  assigned_user_id uuid, lead_id uuid, task_id uuid, appointment_id uuid,
  case_id uuid, invoice_id uuid, sav_id uuid,
  attempt_count integer, last_action_at timestamptz, last_action_type text,
  total_count bigint
)
language sql
stable
as $$
  with filtre as (
    select v.*,
           case
             when v.due_at <= now() and v.due_at::date < current_date then 'urgent'
             when v.due_at <= now() then 'due'
             when v.due_at::date = current_date then 'due'
             else 'upcoming'
           end as urgency_calc,
           greatest(0, current_date - v.due_at::date) as days_late_calc,
           public.niveau_priorite(v.score) as niveau
    from public.v_relances v
    where v.due_at::date <= current_date + p_horizon_days
  ),
  applique as (
    select * from filtre f
    where (p_kinds is null or f.kind = any(p_kinds))
      and (p_urgencies is null or f.urgency_calc = any(p_urgencies))
      and (p_priorities is null or f.niveau = any(p_priorities))
      and (p_assigned is null or f.assigned_user_id = p_assigned)
      and (p_city is null or f.city ilike '%' || p_city || '%')
      and (p_search is null or p_search = '' or
           f.titre ilike '%' || p_search || '%' or
           f.phone ilike '%' || p_search || '%' or
           f.immatriculation ilike '%' || p_search || '%')
  )
  select
    a.id, a.kind, a.urgency_calc, a.due_at, a.days_late_calc, a.waiting_minutes,
    a.score, a.niveau, a.titre, a.motif,
    a.phone, a.city, a.insurance, a.vehicule, a.immatriculation,
    a.assigned_user_id, a.lead_id, a.task_id, a.appointment_id,
    a.case_id, a.invoice_id, a.sav_id,
    a.attempt_count, a.last_action_at, a.last_action_type,
    count(*) over () as total_count
  from applique a
  order by
    case when p_sort = 'priorite'    then a.score end desc nulls last,
    case when p_sort = 'plus_ancien' then a.due_at end asc,
    case when p_sort = 'plus_recent' then a.due_at end desc,
    a.due_at asc
  limit p_limit offset p_offset;
$$;

create or replace function public.compter_relances(p_horizon_days integer default 7)
returns jsonb
language sql
stable
as $$
  with base as (
    select v.kind, v.attempt_count,
           case
             when v.due_at <= now() and v.due_at::date < current_date then 'urgent'
             when v.due_at <= now() then 'due'
             when v.due_at::date = current_date then 'due'
             else 'upcoming'
           end as urgency
    from public.v_relances v
    where v.due_at::date <= current_date + p_horizon_days
  )
  select jsonb_build_object(
    'total',     (select count(*) from base),
    'urgent',    (select count(*) from base where urgency = 'urgent'),
    'due',       (select count(*) from base where urgency = 'due'),
    'upcoming',  (select count(*) from base where urgency = 'upcoming'),
    'nouveau',   (select count(*) from base where kind = 'nouveau'),
    'rappel',    (select count(*) from base where kind = 'rappel'),
    'documents', (select count(*) from base where kind = 'documents'),
    'rdv',       (select count(*) from base where kind = 'rdv'),
    'tache',     (select count(*) from base where kind = 'tache')
  );
$$;

grant execute on function public.fetch_relances(text, text[], text[], text[], uuid, text, text, integer, integer, integer) to authenticated;
grant execute on function public.compter_relances(integer) to authenticated;
grant select on public.v_relances to authenticated;

-- ---------------------------------------------------------------------
-- 20260830180000_qualification_vitrage_lead.sql
-- ---------------------------------------------------------------------

/*
# Champs de qualification vitrage sur les leads

## Pourquoi

`windscreen_cases` porte déjà le détail technique (type de vitrage, capteurs,
caméra ADAS, franchise). Mais ces informations ne s'y trouvent qu'une fois le
dossier créé — c'est-à-dire trop tard.

Or ce sont exactement les questions posées au premier appel : quel vitrage,
quelle assurance, y a-t-il une caméra derrière le pare-brise. La réponse
détermine le prix, la nécessité d'un calibrage, et le reste à charge annoncé
au client. Sans ces champs, le conseiller les notait dans `advisor_notes`, en
texte libre, donc inexploitables.

Ils sont volontairement nullables : un lead qui vient d'arriver n'est pas
encore qualifié, et l'interface doit pouvoir le montrer.
*/

alter table leads add column if not exists glass_type text
  check (glass_type is null or glass_type in (
    'pare_brise', 'lunette_arriere', 'glace_laterale', 'impact', 'autre'
  ));

-- Une caméra derrière le pare-brise impose un calibrage après remplacement :
-- c'est le principal facteur de prix et de durée d'intervention.
alter table leads add column if not exists has_adas_camera boolean;

-- Reste à charge annoncé au client. Nullable tant que l'assurance n'a pas
-- répondu : zéro et « pas encore su » ne sont pas la même chose.
alter table leads add column if not exists franchise_amount numeric(10,2);

comment on column leads.glass_type is 'Vitrage concerné, renseigné à la qualification';
comment on column leads.has_adas_camera is 'Caméra ADAS : impose un calibrage après pose';
comment on column leads.franchise_amount is 'Reste à charge annoncé au client, null si inconnu';

-- ---------------------------------------------------------------------
-- 20260830210000_client_multi_interventions.sql
-- ---------------------------------------------------------------------

/*
# Un client, plusieurs interventions

## Le modèle visé

  contact (le client, une personne)  1 ── N  leads (une intervention chacun)

## Ce qui existait

`leads` portait l'identité en dur (prénom, nom, téléphone, email) sans aucun
lien vers une personne, et `contacts` portait un `lead_id` — la relation
pointait donc contact → lead, en un pour un.

Résultat : un client qui rappelle six mois plus tard pour une lunette arrière
créait un second lead sans lien avec le premier. Son historique était perdu,
et rien ne permettait de savoir qu'on avait déjà travaillé avec lui.

## Le rattachement

Un trigger sur `leads` résout le contact à l'insertion, à partir du téléphone
normalisé puis de l'e-mail. Le passage par un trigger et non par la fonction
webhook est délibéré : leads arrivent aussi par saisie manuelle, par import et
par l'API. Une règle posée en base couvre tous les chemins, présents et futurs.

`contacts.lead_id` devient trompeur mais n'est pas supprimé : des données y
sont peut-être déjà rattachées. Il ne doit plus être utilisé.
*/

-- ============ NORMALISATION DU TÉLÉPHONE ============
-- Sans elle, « +33 6 12 34 56 78 » et « 0612345678 » désignent deux personnes
-- différentes, et le rattachement ne sert à rien.

create or replace function public.normaliser_telephone(p_tel text)
returns text
language plpgsql
immutable
as $$
declare
  chiffres text;
begin
  if p_tel is null then
    return null;
  end if;

  chiffres := regexp_replace(p_tel, '[^0-9]', '', 'g');

  -- 0033... et 33... ramenés au format national
  if chiffres like '0033%' then
    chiffres := '0' || substring(chiffres from 5);
  elsif length(chiffres) = 11 and chiffres like '33%' then
    chiffres := '0' || substring(chiffres from 3);
  end if;

  -- Numéro français à 9 chiffres sans le zéro initial
  if length(chiffres) = 9 then
    chiffres := '0' || chiffres;
  end if;

  if length(chiffres) < 9 then
    return null; -- trop court pour identifier qui que ce soit
  end if;

  return chiffres;
end;
$$;


-- ============ LIEN LEAD -> CLIENT ============

alter table leads add column if not exists contact_id uuid
  references contacts(id) on delete set null;

create index if not exists leads_contact_id_idx on leads (contact_id);

-- Recherche de doublon : l'index porte sur le téléphone normalisé, sinon
-- chaque rattachement balaierait toute la table.
create index if not exists contacts_phone_normalise_idx
  on contacts (workspace_id, (public.normaliser_telephone(phone)));

create index if not exists contacts_email_idx
  on contacts (workspace_id, lower(email));


-- ============ RÉSOLUTION DU CLIENT ============

create or replace function public.trouver_ou_creer_contact(
  p_workspace_id uuid,
  p_phone text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_city text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.normaliser_telephone(p_phone);
  v_email text := nullif(lower(trim(p_email)), '');
  v_id uuid;
begin
  -- Le téléphone prime : c'est l'identifiant le plus fiable du métier.
  if v_tel is not null then
    select id into v_id from contacts
    where workspace_id = p_workspace_id
      and public.normaliser_telephone(phone) = v_tel
    limit 1;
  end if;

  if v_id is null and v_email is not null then
    select id into v_id from contacts
    where workspace_id = p_workspace_id and lower(email) = v_email
    limit 1;
  end if;

  if v_id is not null then
    -- Un rappel apporte souvent une information manquante : on complète sans
    -- jamais écraser ce qui est déjà renseigné.
    update contacts set
      first_name = coalesce(nullif(trim(first_name), ''), nullif(trim(p_first_name), '')),
      last_name  = coalesce(nullif(trim(last_name), ''),  nullif(trim(p_last_name), '')),
      email      = coalesce(nullif(trim(email), ''),      v_email),
      phone      = coalesce(nullif(trim(phone), ''),      p_phone),
      city       = coalesce(nullif(trim(city), ''),       nullif(trim(p_city), '')),
      updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into contacts (workspace_id, first_name, last_name, phone, email, city)
  values (p_workspace_id, nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
          p_phone, v_email, nullif(trim(p_city), ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.trouver_ou_creer_contact(uuid, text, text, text, text, text)
  to authenticated, service_role;


-- ============ RATTACHEMENT AUTOMATIQUE ============

create or replace function public.rattacher_lead_au_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is not null then
    return new;
  end if;

  if new.phone is null and new.email is null then
    return new; -- rien pour identifier la personne
  end if;

  new.contact_id := public.trouver_ou_creer_contact(
    new.workspace_id, new.phone, new.email,
    new.first_name, new.last_name, new.city
  );

  return new;
end;
$$;

drop trigger if exists leads_rattacher_contact on leads;
create trigger leads_rattacher_contact
  before insert or update of phone, email on leads
  for each row execute function public.rattacher_lead_au_contact();


-- ============ RATTRAPAGE DE L'EXISTANT ============
-- Les leads déjà en base sont rattachés dans l'ordre chronologique : le plus
-- ancien crée le contact, les suivants le retrouvent. Traiter dans le
-- désordre créerait des contacts en double.

do $$
declare
  l record;
begin
  for l in
    select id, workspace_id, phone, email, first_name, last_name, city
    from leads
    where contact_id is null and (phone is not null or email is not null)
    order by coalesce(received_at, created_at)
  loop
    update leads
    set contact_id = public.trouver_ou_creer_contact(
      l.workspace_id, l.phone, l.email, l.first_name, l.last_name, l.city)
    where id = l.id;
  end loop;
end $$;


-- ============ VUE DE SYNTHÈSE CLIENT ============

drop view if exists public.v_clients;

create view public.v_clients
with (security_invoker = on)
as
select
  c.id,
  c.workspace_id,
  c.first_name,
  c.last_name,
  c.phone,
  c.email,
  c.city,
  count(l.id)                                           as nb_interventions,
  count(l.id) filter (where l.status = 'converted')      as nb_converties,
  min(coalesce(l.received_at, l.created_at))             as premiere_intervention,
  max(coalesce(l.received_at, l.created_at))             as derniere_intervention
from contacts c
left join leads l on l.contact_id = c.id
group by c.id, c.workspace_id, c.first_name, c.last_name, c.phone, c.email, c.city;

grant select on public.v_clients to authenticated;

comment on column contacts.lead_id is
  'OBSOLETE : la relation est desormais leads.contact_id. Ne plus utiliser.';

-- ---------------------------------------------------------------------
-- 20260830230000_analyse_doublon.sql
-- ---------------------------------------------------------------------

/*
# Distinguer un doublon d'un client fidèle

## Le problème

`checkDuplicateLead` comparait les téléphones **bruts** : « +33 6 12 34 56 78 »
et « 0612345678 » ne se rencontraient jamais. Le contrôle passait donc à côté
de la majorité des cas, précisément ceux qui comptent — un lead Meta arrive au
format international, une saisie manuelle au format national.

Et surtout, il traitait toute répétition comme une anomalie. Or depuis que le
modèle est contact 1 ── N leads, deux leads sur le même numéro sont souvent
légitimes : c'est un client qui revient.

## La distinction

**Doublon** — une autre intervention du même client est encore *ouverte* et
date de moins de trente jours. Le client a rempli le formulaire deux fois, ou
il est arrivé par Meta *et* par le site. Il faut fusionner, pas rappeler deux
fois la même personne.

**Client fidèle** — les autres interventions sont closes, ou anciennes. Rien à
corriger : c'est un bon signe, et le conseiller doit le savoir avant de
décrocher.

Le seuil de trente jours correspond au cycle d'un dossier vitrage : au-delà,
une nouvelle demande est une nouvelle affaire.
*/

create or replace function public.analyser_doublon(
  p_workspace_id uuid,
  p_phone text,
  p_email text,
  p_exclude_lead_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with cible as (
    select public.normaliser_telephone(p_phone) as tel,
           nullif(lower(trim(p_email)), '')     as email
  ),
  autres as (
    select l.id, l.status, coalesce(l.received_at, l.created_at) as recu
    from leads l, cible c
    where l.workspace_id = p_workspace_id
      and (p_exclude_lead_id is null or l.id <> p_exclude_lead_id)
      and (
        (c.tel is not null and public.normaliser_telephone(l.phone) = c.tel)
        or (c.email is not null and lower(l.email) = c.email)
      )
  ),
  -- Une intervention encore ouverte et recente : le client s'est inscrit deux
  -- fois pour la meme chose.
  ouvert as (
    select * from autres
    where status not in ('converted', 'lost')
      and recu > now() - interval '30 days'
    order by recu desc
    limit 1
  ),
  dernier as (select * from autres order by recu desc limit 1)
  select case
    when (select count(*) from autres) = 0
      then jsonb_build_object('type', 'aucun')
    when exists (select 1 from ouvert)
      then jsonb_build_object(
        'type', 'doublon',
        'nb_autres', (select count(*) from autres),
        'lead_id',   (select id from ouvert),
        'statut',    (select status from ouvert),
        'jours',     (select extract(day from now() - recu)::integer from ouvert))
    else jsonb_build_object(
      'type', 'client_fidele',
      'nb_autres', (select count(*) from autres),
      'lead_id',   (select id from dernier),
      'statut',    (select status from dernier),
      'jours',     (select extract(day from now() - recu)::integer from dernier))
  end;
$$;

grant execute on function public.analyser_doublon(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 20260831090000_acces_sur_invitation.sql
-- ---------------------------------------------------------------------

/*
# Accès sur invitation uniquement

## Ce qui était ouvert

`handle_new_user` rattachait **tout** compte créé dans `auth.users` au premier
workspace trouvé, et accordait `admin` au premier profil. La clé anon étant
publique par conception, n'importe qui pouvait appeler `auth.signUp` sur
l'API — sans jamais passer par l'interface — et se retrouver membre, voire
administrateur, de l'espace.

Retirer la page `/signup` côté React ne changeait rien à cela.

## Le principe retenu

Un compte authentifié n'est plus rien par lui-même. **Seul un profil donne
accès aux données**, et un profil n'est créé que si une invitation valide
existe pour cette adresse. Sans invitation, la personne peut s'authentifier
mais `get_workspace_id()` renvoie NULL : toutes les politiques RLS échouent et
elle ne voit rien. C'est un échec fermé, pas un accès dégradé.

Aucun rattachement automatique, aucun repli sur `admin`.

## Le tout premier administrateur

Il reste un chemin, et un seul : `initialiser_premier_admin`, qui refuse de
s'exécuter dès qu'un profil existe. Elle n'est accordée à personne — elle
s'appelle depuis le SQL Editor, donc avec les droits du propriétaire du
projet. C'est volontairement hors de portée de l'application.
*/

-- ============ INVITATIONS ============

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'advisor', 'technician', 'accountant')),
  invited_by uuid references auth.users(id) on delete set null,
  -- Une invitation qui traîne est une porte ouverte : elle expire.
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table invitations enable row level security;

create index if not exists invitations_email_idx on invitations (lower(email));
create index if not exists invitations_workspace_idx on invitations (workspace_id);

-- Une seule invitation en attente par adresse et par espace.
create unique index if not exists invitations_en_attente_uniq
  on invitations (workspace_id, lower(email))
  where accepted_at is null;

-- Seuls les administrateurs de l'espace voient et gèrent les invitations :
-- la liste des personnes conviées et leurs rôles est une information sensible.
drop policy if exists "select_invitations" on invitations;
create policy "select_invitations" on invitations for select
  to authenticated using (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );

drop policy if exists "insert_invitations" on invitations;
create policy "insert_invitations" on invitations for insert
  to authenticated with check (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );

drop policy if exists "update_invitations" on invitations;
create policy "update_invitations" on invitations for update
  to authenticated using (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  ) with check (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );

drop policy if exists "delete_invitations" on invitations;
create policy "delete_invitations" on invitations for delete
  to authenticated using (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );


-- ============ CRÉATION DE PROFIL : SUR INVITATION SEULEMENT ============

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invit invitations%rowtype;
begin
  select * into v_invit
  from invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  -- Pas d'invitation : aucun profil. Le compte existe dans auth.users mais
  -- n'appartient a aucun espace, donc ne voit rien. C'est l'echec ferme.
  if not found then
    raise log 'Inscription sans invitation ignoree pour %', new.email;
    return new;
  end if;

  insert into public.profiles (id, workspace_id, first_name, last_name, role)
  values (
    new.id,
    v_invit.workspace_id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    v_invit.role
  )
  on conflict (id) do nothing;

  update invitations set accepted_at = now() where id = v_invit.id;

  return new;
exception
  when others then
    -- Ne jamais faire echouer la creation du compte sur un probleme de profil.
    raise warning 'handle_new_user a echoue pour %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============ INVITER (réservé aux administrateurs) ============

create or replace function public.creer_invitation(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_id uuid;
begin
  select workspace_id into v_ws from profiles
  where id = auth.uid() and role = 'admin';

  if v_ws is null then
    raise exception 'Seul un administrateur peut inviter';
  end if;

  if p_role not in ('admin', 'manager', 'advisor', 'technician', 'accountant') then
    raise exception 'Role inconnu : %', p_role;
  end if;

  if exists (select 1 from profiles p
             join auth.users u on u.id = p.id
             where lower(u.email) = lower(p_email) and p.workspace_id = v_ws) then
    raise exception 'Cette personne fait deja partie de l''espace';
  end if;

  -- Reinviter quelqu'un doit prolonger l'invitation en attente, pas en creer
  -- une seconde. Ecriture explicite plutot qu'un ON CONFLICT : l'inference sur
  -- un index partiel a expression est fragile.
  update invitations
  set role = p_role,
      expires_at = now() + interval '7 days',
      invited_by = auth.uid()
  where workspace_id = v_ws
    and lower(email) = lower(trim(p_email))
    and accepted_at is null
  returning id into v_id;

  if v_id is null then
    insert into invitations (workspace_id, email, role, invited_by)
    values (v_ws, lower(trim(p_email)), p_role, auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.creer_invitation(text, text) from public, anon;
grant execute on function public.creer_invitation(text, text) to authenticated;


-- ============ AMORÇAGE DU PREMIER ADMINISTRATEUR ============
-- Refuse de s'executer des qu'un profil existe. N'est accordee a personne :
-- elle s'appelle depuis le SQL Editor, avec les droits du proprietaire.

create or replace function public.initialiser_premier_admin(
  p_email text,
  p_nom_workspace text default 'Relais Pare-Brise'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_ws uuid;
begin
  if exists (select 1 from profiles) then
    raise exception 'Un profil existe deja : passez par une invitation';
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Aucun compte pour %. Creez-le d''abord dans Authentication > Users.', p_email;
  end if;

  select id into v_ws from workspaces order by created_at limit 1;
  if v_ws is null then
    insert into workspaces (name, slug)
    values (p_nom_workspace, 'relais-pare-brise')
    returning id into v_ws;
  end if;

  insert into profiles (id, workspace_id, first_name, last_name, role)
  values (v_user, v_ws, '', '', 'admin');

  return v_ws;
end;
$$;

revoke all on function public.initialiser_premier_admin(text, text) from public, anon, authenticated;
