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
    const pageAccessToken = await getSecret(profile.workspace_id, 'page_access_token');
    const graphVersion = settings?.graph_api_version || 'v21.0';
    const pageId = settings?.facebook_page_id;

    if (!pageAccessToken || !pageId) {
      return new Response(JSON.stringify({ error: 'Missing page access token or page ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch Lead Gen Forms for the page
    const formsUrl = `https://graph.facebook.com/${graphVersion}/${pageId}/leadgen_forms?access_token=${pageAccessToken}&limit=100`;
    const resp = await fetch(formsUrl);
    const data = await resp.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const forms = data.data ?? [];

    // Store forms in meta_forms table
    for (const form of forms) {
      const { error: upsertError } = await supabase
        .from('meta_forms')
        .upsert({
          workspace_id: profile.workspace_id,
          connection_id: connection.id,
          meta_page_id: pageId,
          meta_form_id: form.id,
          form_name: form.name,
          enabled: true,
        }, {
          onConflict: 'workspace_id,meta_form_id',
        });

      if (upsertError) {
        console.error('Form upsert error:', upsertError.message);
      }
    }

    // Update connection sync timestamp
    await supabase
      .from('integration_connections')
      .update({ last_success_at: new Date().toISOString() })
      .eq('id', connection.id);

    // Log action
    await supabase
      .from('audit_logs')
      .insert({
        workspace_id: profile.workspace_id,
        user_id: user.id,
        action: 'meta_forms_synced',
        entity_type: 'meta_forms',
        metadata: { count: forms.length },
      });

    return new Response(
      JSON.stringify({ success: true, forms: forms.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
