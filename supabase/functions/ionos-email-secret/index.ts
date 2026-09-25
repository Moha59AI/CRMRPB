import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { readIonosPassword, writeIonosPassword } from '../_shared/ionos-email.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('FORBIDDEN');
  if (profile.role !== 'admin') throw new Error('FORBIDDEN');
  return { userId: data.user.id, workspaceId: profile.workspace_id as string };
}

async function requireMailbox(workspaceId: string) {
  const { data, error } = await admin
    .from('integration_connections')
    .select('id, settings')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'ionos')
    .maybeSingle();
  if (error) throw new Error(error.message);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const emailAddress = typeof settings.email_address === 'string'
    ? settings.email_address.trim().toLowerCase()
    : '';
  if (!data || !emailAddress) throw new Error('BOITE_IONOS_NON_CONFIGUREE');
  return { connectionId: data.id as string, emailAddress };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method Not Allowed' }, 405);

  try {
    const { userId, workspaceId } = await requireAdmin(req);
    const mailbox = await requireMailbox(workspaceId);

    if (req.method === 'GET') {
      return json({
        configured: Boolean(await readIonosPassword(admin, workspaceId)),
        email_address: mailbox.emailAddress,
      });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8 || password.length > 512) {
      throw new Error('MOT_DE_PASSE_IONOS_INVALIDE');
    }

    await writeIonosPassword(admin, workspaceId, password);
    const { error: connectionError } = await admin.from('integration_connections').update({
      status: 'not_configured',
      last_error: null,
      last_tested_at: new Date().toISOString(),
    }).eq('id', mailbox.connectionId);
    if (connectionError) throw new Error(connectionError.message);

    const { error: auditError } = await admin.from('audit_logs').insert({
      workspace_id: workspaceId,
      user_id: userId,
      action: 'ionos_email_password_stored',
      entity_type: 'integration_connection',
      entity_id: mailbox.connectionId,
      metadata: { protocoles: ['imap', 'smtp'] },
    });
    if (auditError) console.error('Audit mot de passe IONOS:', auditError.message);

    return json({ success: true, configured: true, email_address: mailbox.emailAddress });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return json({ success: false, error: message }, status);
  }
});
