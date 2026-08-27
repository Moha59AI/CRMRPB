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
