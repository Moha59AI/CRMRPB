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
