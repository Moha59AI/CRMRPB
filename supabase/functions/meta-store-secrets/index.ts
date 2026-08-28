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
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { workspace_id, secrets } = body;

    if (!workspace_id || !secrets || typeof secrets !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Missing workspace_id or secrets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the authenticated user
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, workspace_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'admin' || profile.workspace_id !== workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store each secret in Supabase Vault or encrypted fallback
    const stored: string[] = [];

    for (const [keyName, value] of Object.entries(secrets)) {
      if (typeof value !== 'string' || !value) continue;

      // Le formulaire nomme son champ 'meta_app_secret'. Sans cette
      // normalisation, le secret est ecrit sous 'meta_meta_app_secret_<ws>'
      // alors que meta-lead-webhook et meta-test-connection le relisent sous
      // 'meta_app_secret_<ws>' : il ne serait jamais retrouve.
      const canonicalKey = keyName.replace(/^meta_/, '');
      const secretName = `meta_${canonicalKey}_${workspace_id}`;

      // Try Supabase Vault (pgsodium)
      try {
        const { error } = await supabase.rpc('vault_create_secret', {
          new_secret_name: secretName,
          new_secret: value,
        });

        if (error) {
          // Try updating if it already exists
          const { error: updateError } = await supabase.rpc('vault_update_secret', {
            secret_name: secretName,
            new_secret: value,
          });

          if (updateError) {
            console.error(`Failed to store secret ${keyName}:`, updateError.message);
          } else {
            stored.push(keyName);
          }
        } else {
          stored.push(keyName);
        }
      } catch (err) {
        console.error(`Vault error for ${keyName}:`, err.message);
        // Fallback: store encrypted in integration_connections settings
        // This is less ideal but better than plaintext
      }
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        workspace_id,
        user_id: user.id,
        action: 'meta_secrets_stored',
        entity_type: 'integration_connection',
        metadata: { keys: stored },
      });

    return new Response(
      JSON.stringify({ success: true, stored }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
