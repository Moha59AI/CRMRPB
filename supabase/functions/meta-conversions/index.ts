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

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeValue(value: string): string {
  return value.toLowerCase().trim().replace(/\s/g, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'test') {
      // Send a test event
      const testEvent = {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://relais-pare-brise.fr',
        user_data: {
          external_id: await sha256('test_user_123'),
          fbp: 'fb.1.test',
          fbc: 'fb.1.test',
        },
        custom_data: { value: 0, currency: 'EUR' },
      };

      return await sendConversionEvent(testEvent, true);
    }

    if (action === 'send') {
      const event = body.event;
      if (!event || !event.event_name) {
        return new Response(
          JSON.stringify({ error: 'Missing event data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return await sendConversionEvent(event, false);
    }

    if (action === 'send_batch') {
      const events = body.events;
      if (!Array.isArray(events)) {
        return new Response(
          JSON.stringify({ error: 'Missing events array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return await sendConversionBatch(events);
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendConversionEvent(event: Record<string, unknown>, isTest: boolean): Promise<Response> {
  // Get the Meta connection for this workspace
  // Find a Meta connection
  const { data: connection, error } = await supabase
    .from('integration_connections')
    .select('workspace_id, settings')
    .eq('provider', 'meta')
    .maybeSingle();

  if (error || !connection) {
    return new Response(
      JSON.stringify({ error: 'Meta connection not configured' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const settings = connection.settings as Record<string, string>;
  const pixelId = settings?.meta_pixel_id;
  const graphVersion = settings?.graph_api_version || 'v21.0';
  const testEventCode = isTest ? settings?.test_event_code : undefined;

  if (!pixelId) {
    return new Response(
      JSON.stringify({ error: 'Meta Pixel ID not configured' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get the Conversions API token
  const conversionsToken = await getSecret(connection.workspace_id, 'conversions_api_token');
  if (!conversionsToken) {
    return new Response(
      JSON.stringify({ error: 'Conversions API token not configured' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Hash user data
  const userData = (event.user_data ?? {}) as Record<string, string>;
  const hashedUserData: Record<string, string> = {};
  for (const [key, value] of Object.entries(userData)) {
    if (typeof value === 'string' && value.length > 0) {
      hashedUserData[key] = await sha256(normalizeValue(value));
    }
  }

  const payload: Record<string, unknown> = {
    data: [{
      ...event,
      user_data: hashedUserData,
    }],
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/${graphVersion}/${pixelId}/events?access_token=${conversionsToken}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result.error) {
      // Log the error
      await supabase
        .from('audit_logs')
        .insert({
          workspace_id: connection.workspace_id,
          action: 'meta_conversions_error',
          entity_type: 'conversion_event',
          metadata: { error: result.error.message, event_name: event.event_name },
        });

      return new Response(
        JSON.stringify({ error: result.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log success
    await supabase
      .from('audit_logs')
      .insert({
        workspace_id: connection.workspace_id,
        action: 'meta_conversions_sent',
        entity_type: 'conversion_event',
        metadata: { event_name: event.event_name, event_id: event.event_id },
      });

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function sendConversionBatch(events: Record<string, unknown>[]): Promise<Response> {
  // Similar to sendConversionEvent but with batch
  const { data: connection, error } = await supabase
    .from('integration_connections')
    .select('workspace_id, settings')
    .eq('provider', 'meta')
    .maybeSingle();

  if (error || !connection) {
    return new Response(
      JSON.stringify({ error: 'Meta connection not configured' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const settings = connection.settings as Record<string, string>;
  const pixelId = settings?.meta_pixel_id;
  const graphVersion = settings?.graph_api_version || 'v21.0';

  if (!pixelId) {
    return new Response(
      JSON.stringify({ error: 'Meta Pixel ID not configured' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const conversionsToken = await getSecret(connection.workspace_id, 'conversions_api_token');
  if (!conversionsToken) {
    return new Response(
      JSON.stringify({ error: 'Conversions API token not configured' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Hash user data for all events
  const hashedEvents = [];
  for (const event of events) {
    const userData = (event.user_data ?? {}) as Record<string, string>;
    const hashedUserData: Record<string, string> = {};
    for (const [key, value] of Object.entries(userData)) {
      if (typeof value === 'string' && value.length > 0) {
        hashedUserData[key] = await sha256(normalizeValue(value));
      }
    }
    hashedEvents.push({ ...event, user_data: hashedUserData });
  }

  const url = `https://graph.facebook.com/${graphVersion}/${pixelId}/events?access_token=${conversionsToken}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: hashedEvents }),
    });

    const result = await response.json();

    if (result.error) {
      return new Response(
        JSON.stringify({ error: result.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function getSecret(workspaceId: string, keyName: string): Promise<string | null> {
  // Try Supabase Vault
  try {
    const { data, error } = await supabase
      .from('vault_decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', `meta_${keyName}_${workspaceId}`)
      .maybeSingle();
    if (!error && data) return data.decrypted_secret;
  } catch {
    // Vault not available
  }

  // Try rpc
  try {
    const { data, error } = await supabase
      .rpc('vault_read_secret', { secret_name: `meta_${keyName}_${workspaceId}` });
    if (!error && data) return data;
  } catch {
    // Not available
  }

  return null;
}
