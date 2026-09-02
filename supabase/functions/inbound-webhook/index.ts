import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Path: /functions/v1/inbound-webhook/<endpoint_key>
    const endpointKey = pathParts[pathParts.length - 1];

    if (!endpointKey) {
      return new Response(JSON.stringify({ error: 'Missing endpoint key' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find the webhook endpoint
    const { data: endpoint, error: endpointError } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('endpoint_key', endpointKey)
      .eq('direction', 'inbound')
      .maybeSingle();

    if (endpointError || !endpoint) {
      return new Response(JSON.stringify({ error: 'Invalid endpoint' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!endpoint.enabled) {
      return new Response(JSON.stringify({ error: 'Endpoint disabled' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse the payload
    const bodyText = await req.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = { raw: bodyText };
    }

    // Extract headers
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Generate external event ID for idempotency
    const externalEventId = payload.id?.toString() || payload.event_id?.toString() || crypto.randomUUID();

    // Check for duplicate
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('endpoint_id', endpoint.id)
      .eq('external_event_id', externalEventId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: true, message: 'Duplicate event ignored' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert webhook event
    const { data: eventRecord, error: insertError } = await supabase
      .from('webhook_events')
      .insert({
        workspace_id: endpoint.workspace_id,
        endpoint_id: endpoint.id,
        provider: endpoint.provider,
        external_event_id: externalEventId,
        event_type: payload.event_type?.toString() || payload.type?.toString() || 'incoming',
        headers,
        payload,
        processing_status: 'pending',
      })
      .select('id')
      .maybeSingle();

    if (insertError || !eventRecord) {
      return new Response(JSON.stringify({ error: 'Failed to store event' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Try to process the lead from the payload
    // The configuration field mapping tells us how to map fields
    const config = (endpoint.configuration ?? {}) as Record<string, unknown>;
    const fieldMapping = (config.field_mapping ?? {}) as Record<string, string>;

    try {
      await supabase
        .from('webhook_events')
        .update({ processing_status: 'processing' })
        .eq('id', eventRecord.id);

      // Map fields from the payload
      const mappedLead: Record<string, string | null> = {
        first_name: null, last_name: null, phone: null, email: null,
        address: null, city: null, postal_code: null, citycode: null,
        vehicle_registration: null, vehicle_make: null, vehicle_model: null,
        gclid: null, gbraid: null, wbraid: null,
        google_campaign_id: null, google_ad_group_id: null, google_ad_id: null,
        utm_source: null, utm_medium: null, utm_campaign: null,
        utm_content: null, utm_term: null,
      };

      for (const [payloadField, leadField] of Object.entries(fieldMapping)) {
        if (leadField === 'ignore' || leadField === 'custom') continue;

        // Support nested field access (e.g., "data.first_name")
        const value = getNestedValue(payload, payloadField);
        if (typeof value === 'string' && value) {
          if (leadField === 'phone') {
            mappedLead.phone = normalizePhone(value);
          } else if (leadField === 'email') {
            mappedLead.email = value.toLowerCase().trim();
          } else if (leadField === 'vehicle_registration') {
            mappedLead.vehicle_registration = value.toUpperCase().replace(/\s/g, '');
          } else if (leadField === 'full_name') {
            const parts = value.split(' ');
            mappedLead.first_name = parts[0];
            mappedLead.last_name = parts.slice(1).join(' ');
          } else {
            mappedLead[leadField] = value;
          }
        }
      }

      // If no mapping configured, try common field names
      if (!mappedLead.first_name) mappedLead.first_name = getFirstValid(payload, ['first_name', 'firstname', 'prenom', 'prénom']) ?? null;
      if (!mappedLead.last_name) mappedLead.last_name = getFirstValid(payload, ['last_name', 'lastname', 'nom']) ?? null;
      if (!mappedLead.phone) {
        const phone = getFirstValid(payload, ['phone', 'telephone', 'téléphone', 'mobile']);
        if (phone) mappedLead.phone = normalizePhone(phone);
      }
      if (!mappedLead.email) {
        const email = getFirstValid(payload, ['email', 'e_mail', 'courriel']);
        if (email) mappedLead.email = email.toLowerCase().trim();
      }
      if (!mappedLead.city) mappedLead.city = getFirstValid(payload, ['city', 'ville']) ?? null;
      if (!mappedLead.address) mappedLead.address = getFirstValid(payload, ['address', 'adresse', 'street_address']) ?? null;
      if (!mappedLead.postal_code) mappedLead.postal_code = getFirstValid(payload, ['postal_code', 'postcode', 'zip', 'code_postal']) ?? null;

      // Les formulaires du site peuvent envoyer ces valeurs a la racine ou
      // dans un objet tracking/attribution. Les conserver des l'arrivee est
      // indispensable : un GCLID perdu ne peut pas etre reconstruit ensuite.
      const trackingFields = {
        gclid: ['gclid', 'tracking.gclid', 'attribution.gclid'],
        gbraid: ['gbraid', 'tracking.gbraid', 'attribution.gbraid'],
        wbraid: ['wbraid', 'tracking.wbraid', 'attribution.wbraid'],
        google_campaign_id: ['google_campaign_id', 'campaignid', 'campaign_id', 'tracking.campaignid'],
        google_ad_group_id: ['google_ad_group_id', 'adgroupid', 'ad_group_id', 'tracking.adgroupid'],
        google_ad_id: ['google_ad_id', 'creative', 'ad_id', 'tracking.creative'],
        utm_source: ['utm_source', 'tracking.utm_source', 'attribution.utm_source'],
        utm_medium: ['utm_medium', 'tracking.utm_medium', 'attribution.utm_medium'],
        utm_campaign: ['utm_campaign', 'tracking.utm_campaign', 'attribution.utm_campaign'],
        utm_content: ['utm_content', 'tracking.utm_content', 'attribution.utm_content'],
        utm_term: ['utm_term', 'tracking.utm_term', 'attribution.utm_term'],
      };
      for (const [field, candidates] of Object.entries(trackingFields)) {
        if (!mappedLead[field]) mappedLead[field] = getFirstValid(payload, candidates) ?? null;
      }

      // Create lead if we have at least a name or phone
      if (mappedLead.first_name || mappedLead.last_name || mappedLead.phone || mappedLead.email) {
        const { error: leadError } = await supabase.rpc('upsert_lead_from_webhook', {
          p_workspace_id: endpoint.workspace_id,
          p_first_name: mappedLead.first_name,
          p_last_name: mappedLead.last_name,
          p_phone: mappedLead.phone,
          p_email: mappedLead.email,
          p_address: mappedLead.address,
          p_city: mappedLead.city,
          p_postal_code: mappedLead.postal_code,
          p_citycode: mappedLead.citycode,
          p_vehicle_registration: mappedLead.vehicle_registration,
          p_vehicle_make: mappedLead.vehicle_make,
          p_vehicle_model: mappedLead.vehicle_model,
          p_source: 'webhook',
          p_gclid: mappedLead.gclid,
          p_gbraid: mappedLead.gbraid,
          p_wbraid: mappedLead.wbraid,
          p_google_campaign_id: mappedLead.google_campaign_id,
          p_google_ad_group_id: mappedLead.google_ad_group_id,
          p_google_ad_id: mappedLead.google_ad_id,
          p_utm_source: mappedLead.utm_source,
          p_utm_medium: mappedLead.utm_medium,
          p_utm_campaign: mappedLead.utm_campaign,
          p_utm_content: mappedLead.utm_content,
          p_utm_term: mappedLead.utm_term,
          p_raw_payload: payload,
          p_received_at: new Date().toISOString(),
        });

        if (leadError) {
          throw new Error(`Lead creation failed: ${leadError.message}`);
        }
      }

      // Mark as processed
      await supabase
        .from('webhook_events')
        .update({
          processing_status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventRecord.id);

    } catch (err) {
      console.error('Webhook processing error:', err.message);
      await supabase
        .from('webhook_events')
        .update({
          processing_status: 'error',
          error_message: err.message,
          processing_attempts: 1,
        })
        .eq('id', eventRecord.id);
    }

    return new Response(
      JSON.stringify({ success: true, event_id: eventRecord.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function getFirstValid(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = getNestedValue(obj, key);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+33')) {
    return '0' + cleaned.slice(3);
  }
  if (cleaned.startsWith('33') && cleaned.length === 11) {
    return '0' + cleaned.slice(2);
  }
  return cleaned;
}
