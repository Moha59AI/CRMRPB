import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('PROFILE_NOT_FOUND');
  if (profile.role !== 'admin') throw new Error('FORBIDDEN');

  return { userId: user.id, workspaceId: profile.workspace_id as string };
}

function secretName(workspaceId: string) {
  return 'openai_api_key_' + workspaceId;
}

async function readSecret(workspaceId: string): Promise<string | null> {
  const { data, error } = await adminClient.rpc('vault_read_secret', {
    secret_name: secretName(workspaceId),
  });
  if (error) throw new Error('VAULT_READ_FAILED: ' + error.message);
  return typeof data === 'string' && data.length > 0 ? data : null;
}

async function writeSecret(workspaceId: string, apiKey: string) {
  const name = secretName(workspaceId);
  const current = await readSecret(workspaceId);
  const rpc = current ? 'vault_update_secret' : 'vault_create_secret';
  const args = current
    ? { secret_name: name, new_secret: apiKey }
    : { new_secret_name: name, new_secret: apiKey };
  const { error } = await adminClient.rpc(rpc, args);
  if (error) throw new Error('VAULT_WRITE_FAILED: ' + error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    const { userId, workspaceId } = await requireAdmin(req);

    if (req.method === 'GET') {
      return jsonResponse({ configured: Boolean(await readSecret(workspaceId)), model: 'gpt-5.6-terra' });
    }

    const body = await req.json();
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    if (apiKey.length < 20) return jsonResponse({ error: 'Clé API OpenAI invalide' }, 400);

    await writeSecret(workspaceId, apiKey);
    const { error: auditError } = await adminClient.from('audit_logs').insert({
      workspace_id: workspaceId,
      user_id: userId,
      action: 'openai_secret_stored',
      entity_type: 'integration_connection',
      metadata: { model: 'gpt-5.6-terra' },
    });
    if (auditError) console.error('Audit OpenAI:', auditError.message);

    return jsonResponse({ success: true, configured: true, model: 'gpt-5.6-terra' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
