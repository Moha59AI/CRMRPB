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

async function getSecret(workspaceId: string, keyName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('vault_decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', `meta_${keyName}_${workspaceId}`)
      .maybeSingle();
    if (!error && data) return data.decrypted_secret;
  } catch {
    // Not available
  }
  try {
    const { data, error } = await supabase
      .rpc('vault_read_secret', { secret_name: `meta_${keyName}_${workspaceId}` });
    if (!error && data) return data;
  } catch {
    // Not available
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: connection } = await supabase
      .from('integration_connections')
      .select('*')
      .eq('workspace_id', profile.workspace_id)
      .eq('provider', 'meta')
      .maybeSingle();

    if (!connection) {
      return new Response(JSON.stringify({ error: 'Meta connection not configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const settings = connection.settings as Record<string, string>;
    const appSecret = await getSecret(profile.workspace_id, 'app_secret');
    const graphVersion = settings?.graph_api_version || 'v21.0';
    const appId = settings?.meta_app_id;
    const pageId = settings?.facebook_page_id;

    if (!appSecret || !appId) {
      return new Response(JSON.stringify({ error: 'Missing app credentials' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Subscribe the app to the page for leadgen events
    // Using the page access token
    const pageAccessToken = await getSecret(profile.workspace_id, 'page_access_token');
    if (!pageAccessToken || !pageId) {
      return new Response(JSON.stringify({ error: 'Missing page access token or page ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Subscribe to page webhook
    const subscribeUrl = `https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps?access_token=${pageAccessToken}`;
    const resp = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: 'leadgen',
      }),
    });

    const data = await resp.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Log action
    await supabase
      .from('audit_logs')
      .insert({
        workspace_id: profile.workspace_id,
        user_id: user.id,
        action: 'meta_page_subscribed',
        entity_type: 'integration_connection',
        entity_id: connection.id,
      });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
