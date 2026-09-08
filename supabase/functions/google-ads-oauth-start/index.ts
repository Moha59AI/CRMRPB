import {
  adminClient, corsHeaders, getGoogleConnection, jsonResponse, readGoogleSecret,
  requireAdmin, sha256,
} from '../_shared/google-ads.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    const { userId, workspaceId } = await requireAdmin(req);
    const connection = await getGoogleConnection(workspaceId);
    const settings = (connection.settings ?? {}) as Record<string, unknown>;
    const clientId = String(settings.client_id ?? '');
    if (!clientId) return jsonResponse({ error: 'Enregistrez le Client ID OAuth avant de continuer' }, 400);
    await readGoogleSecret(workspaceId, 'client_secret');
    await readGoogleSecret(workspaceId, 'developer_token');

    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error: stateError } = await adminClient.from('google_ads_oauth_states').insert({
      workspace_id: workspaceId,
      user_id: userId,
      state_hash: await sha256(state),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (stateError) throw new Error(stateError.message);

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-ads-oauth-callback`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      // Autorisation incrementale : le meme compte Google sert aux donnees Ads
      // et au miroir des rendez-vous CRM, sans demander un second couple de
      // secrets OAuth.
      scope: [
        'https://www.googleapis.com/auth/adwords',
        'https://www.googleapis.com/auth/calendar.events',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();

    return jsonResponse({ success: true, auth_url: url.toString(), redirect_uri: redirectUri });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
