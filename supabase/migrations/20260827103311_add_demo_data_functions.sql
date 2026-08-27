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
