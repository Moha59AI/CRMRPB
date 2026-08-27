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

async function hexToBytes(hex: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function verifySignature(payload: string, signature: string, appSecret: string): Promise<boolean> {
  try {
    const keyData = await hexToBytes(appSecret);
    const key = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const encoder = new TextEncoder();
    const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expected = 'sha256=' + Array.from(new Uint8Array(signed))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return expected === signature;
  } catch {
    return false;
  }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+33')) {
    return '0' + cleaned.slice(3);
  }
  if (cleaned.startsWith('33') && cleaned.length === 11) {
    return '0' + cleaned.slice(2);
  }
  return cleaned;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizeRegistration(reg: string): string {
  return reg.toUpperCase().replace(/\s/g, '');
}

async function getMetaConnection(workspaceId: string) {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'meta')
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function getMetaSecret(workspaceId: string, keyName: string): Promise<string | null> {
  // Try Supabase Vault first (vault.decrypted_secrets)
  try {
    const { data, error } = await supabase
      .rpc('vault_read_secret', { secret_name: `meta_${keyName}_${workspaceId}` });
    if (!error && data) return data;
  } catch {
    // Vault not available, fall through
  }

  // Fallback: INTEGRATION_ENCRYPTION_KEY based decryption
  // Secrets are stored in a dedicated table or in integration_connections settings as encrypted values
  const encKey = Deno.env.get('INTEGRATION_ENCRYPTION_KEY');
  if (!encKey) return null;

  // Try reading from vault.decrypted_secrets table directly
  try {
    const { data, error } = await supabase
      .from('vault_decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', `meta_${keyName}_${workspaceId}`)
      .maybeSingle();
    if (!error && data) return data.decrypted_secret;
  } catch {
    // Table not available
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // GET: Meta webhook verification
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token) {
        // Find the workspace that has this verify token
        const { data: connections } = await supabase
          .from('integration_connections')
          .select('workspace_id, settings')
          .eq('provider', 'meta');

        if (!connections) {
          return new Response('Forbidden', { status: 403, headers: corsHeaders });
        }

        for (const conn of connections) {
          const settings = conn.settings as Record<string, string>;
          if (settings?.webhook_verify_token === token) {
            return new Response(challenge, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
          }
        }

        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }

      return new Response('Bad Request', { status: 400, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // POST: Lead processing
  if (req.method === 'POST') {
    try {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText);
      const signature = req.headers.get('x-hub-signature-256') || '';

      // Find workspace by verify token is not possible in POST
      // We need to verify the signature with the app secret
      // Try all Meta connections to find the matching one
      const { data: connections } = await supabase
        .from('integration_connections')
        .select('workspace_id, settings')
        .eq('provider', 'meta');

      if (!connections || connections.length === 0) {
        return new Response('No Meta connection configured', { status: 200, headers: corsHeaders });
      }

      let matchedWorkspace: string | null = null;

      for (const conn of connections) {
        const settings = conn.settings as Record<string, string>;
        if (!settings?.webhook_verify_token) continue;

        const appSecret = await getMetaSecret(conn.workspace_id, 'app_secret');
        if (!appSecret) continue;

        if (await verifySignature(bodyText, signature, appSecret)) {
          matchedWorkspace = conn.workspace_id;
          break;
        }
      }

      // If signature verification fails, still return 200 to prevent Meta from retrying aggressively
      // but don't process the event
      if (!matchedWorkspace) {
        console.error('Webhook signature verification failed - no matching workspace');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Respond immediately with 200
      // Process asynchronously

      const entries = body?.entry ?? [];
      const connection = await getMetaConnection(matchedWorkspace);
      if (!connection) {
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const pageAccessToken = await getMetaSecret(matchedWorkspace, 'page_access_token');
      const settings = connection.settings as Record<string, string>;
      const graphVersion = settings?.graph_api_version || 'v21.0';

      // Process each entry
      for (const entry of entries) {
        const pageId = entry?.id;
        const changes = entry?.changes ?? [];

        for (const change of changes) {
          const field = change?.field;
          if (field !== 'leadgen') continue;

          const leadgenId = change?.value?.leadgen_id;
          if (!leadgenId) continue;

          // Check for duplicate event
          const { data: existingEvent } = await supabase
            .from('webhook_events')
            .select('id')
            .eq('external_event_id', leadgenId)
            .maybeSingle();

          if (existingEvent) {
            continue;
          }

          // Insert webhook event
          const { data: eventRecord } = await supabase
            .from('webhook_events')
            .insert({
              workspace_id: matchedWorkspace,
              provider: 'meta',
              external_event_id: leadgenId,
              event_type: 'leadgen',
              payload: change?.value,
              processing_status: 'processing',
            })
            .select('id')
            .maybeSingle();

          const eventId = eventRecord?.id;

          try {
            if (!pageAccessToken) {
              throw new Error('No page access token configured');
            }

            // Fetch lead data from Graph API
            const leadUrl = `https://graph.facebook.com/${graphVersion}/${leadgenId}?access_token=${pageAccessToken}`;
            const leadResp = await fetch(leadUrl);
            const leadData = await leadResp.json();

            if (leadData.error) {
              throw new Error(leadData.error.message);
            }

            const formId = leadData.form_id;
            const leadgenData = leadData.field_data ?? [];

            // Fetch form details for mapping
            const { data: metaForm } = await supabase
              .from('meta_forms')
              .select('field_mapping')
              .eq('meta_form_id', formId)
              .maybeSingle();

            const fieldMapping = (metaForm?.field_mapping ?? {}) as Record<string, string>;

            // Convert field_data to key-value pairs
            const leadFields: Record<string, string> = {};
          for (const fd of leadgenData) {
            const fieldName = fd.name;
            const rawValue = Array.isArray(fd.values) ? fd.values[0] : fd.values;
            leadFields[fieldName] = rawValue;
          }

            // Apply mapping
            const mappedLead: Record<string, string | null> = {
              first_name: null, last_name: null, phone: null, email: null,
              city: null, vehicle_registration: null, vehicle_make: null, vehicle_model: null,
            };

            for (const [metaField, leadField] of Object.entries(fieldMapping)) {
              if (leadField === 'ignore' || leadField === 'custom') continue;
              const value = leadFields[metaField];
              if (!value) continue;

              if (leadField === 'full_name') {
                const parts = value.split(' ');
                mappedLead.first_name = parts[0] || null;
                mappedLead.last_name = parts.slice(1).join(' ') || null;
              } else if (leadField === 'phone') {
                mappedLead.phone = normalizePhone(value);
              } else if (leadField === 'email') {
                mappedLead.email = normalizeEmail(value);
              } else if (leadField === 'vehicle_registration') {
                mappedLead.vehicle_registration = normalizeRegistration(value);
              } else {
                mappedLead[leadField] = value;
              }
            }

            // If no mapping configured, try common field names
            if (!mappedLead.first_name && !mappedLead.last_name) {
              mappedLead.first_name = leadFields['first_name'] || leadFields['prénom'] || null;
              mappedLead.last_name = leadFields['last_name'] || leadFields['nom'] || null;
            }
            if (!mappedLead.phone) mappedLead.phone = leadFields['phone'] ? normalizePhone(leadFields['phone']) : (leadFields['téléphone'] ? normalizePhone(leadFields['téléphone']) : null);
            if (!mappedLead.email) mappedLead.email = leadFields['email'] ? normalizeEmail(leadFields['email']) : null;
            if (!mappedLead.city) mappedLead.city = leadFields['city'] || leadFields['ville'] || null;
            if (!mappedLead.vehicle_registration) mappedLead.vehicle_registration = leadFields['vehicle_registration'] ? normalizeRegistration(leadFields['vehicle_registration']) : (leadFields['immatriculation'] ? normalizeRegistration(leadFields['immatriculation']) : null);

            // Fetch campaign info if available
            let campaignId: string | null = null;
            let adId: string | null = null;
            let adsetId: string | null = null;
            try {
              const formUrl = `https://graph.facebook.com/${graphVersion}/${formId}?access_token=${pageAccessToken}&fields=created_lead,leads`;
              const formResp = await fetch(formUrl);
              const formData = await formResp.json();
              if (formData?.id) {
                // Try to get ad-level info from the lead
                if (leadData.ad_id) adId = leadData.ad_id;
                if (leadData.adset_id) adsetId = leadData.adset_id;
                if (leadData.campaign_id) campaignId = leadData.campaign_id;
              }
            } catch {
              // Campaign info is optional
            }

            // Create the lead using the upsert function
            const { error: leadError } = await supabase.rpc('upsert_lead_from_webhook', {
              p_workspace_id: matchedWorkspace,
              p_first_name: mappedLead.first_name,
              p_last_name: mappedLead.last_name,
              p_phone: mappedLead.phone,
              p_email: mappedLead.email,
              p_city: mappedLead.city,
              p_vehicle_registration: mappedLead.vehicle_registration,
              p_vehicle_make: mappedLead.vehicle_make,
              p_vehicle_model: mappedLead.vehicle_model,
              p_source: 'meta',
              p_meta_lead_id: leadgenId,
              p_meta_page_id: pageId,
              p_meta_form_id: formId,
              p_meta_ad_id: adId,
              p_meta_adset_id: adsetId,
              p_meta_campaign_id: campaignId,
              p_raw_payload: leadData,
              p_received_at: new Date().toISOString(),
            });

            if (leadError) {
              throw new Error(`Lead creation failed: ${leadError.message}`);
            }

            // Mark event as processed
            if (eventId) {
              await supabase
                .from('webhook_events')
                .update({
                  processing_status: 'processed',
                  processed_at: new Date().toISOString(),
                })
                .eq('id', eventId);
            }
          } catch (err) {
            console.error('Lead processing error:', err.message);
            if (eventId) {
              await supabase
                .from('webhook_events')
                .update({
                  processing_status: 'error',
                  error_message: err.message,
                  processing_attempts: 1,
                })
                .eq('id', eventId);
            }
          }
        }
      }

      return new Response('OK', { status: 200, headers: corsHeaders });
    } catch (err) {
      console.error('Webhook error:', err.message);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
});
