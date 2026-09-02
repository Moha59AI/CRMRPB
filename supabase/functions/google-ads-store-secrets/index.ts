import {
  adminClient, corsHeaders, jsonResponse, requireAdmin, writeGoogleSecret,
} from '../_shared/google-ads.ts';

const allowedKeys = new Set(['developer_token', 'client_secret']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    const { userId, workspaceId } = await requireAdmin(req);
    const body = await req.json();
    const secrets = body?.secrets as Record<string, unknown> | undefined;
    if (!secrets) return jsonResponse({ error: 'Secrets manquants' }, 400);

    const stored: string[] = [];
    for (const [key, rawValue] of Object.entries(secrets)) {
      if (!allowedKeys.has(key) || typeof rawValue !== 'string' || !rawValue.trim()) continue;
      await writeGoogleSecret(workspaceId, key, rawValue.trim());
      stored.push(key);
    }

    const { error: auditError } = await adminClient.from('audit_logs').insert({
      workspace_id: workspaceId,
      user_id: userId,
      action: 'google_ads_secrets_stored',
      entity_type: 'integration_connection',
      metadata: { keys: stored },
    });
    if (auditError) console.error('Audit Google Ads:', auditError.message);

    return jsonResponse({ success: true, stored });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
