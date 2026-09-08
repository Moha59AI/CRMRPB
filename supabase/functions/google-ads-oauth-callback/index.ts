import {
  adminClient, getGoogleConnection, readGoogleSecret, sha256, writeGoogleSecret,
} from '../_shared/google-ads.ts';

function resultPage(success: boolean, message: string): Response {
  const safeMessage = message.replace(/[<>&"']/g, '');
  const color = success ? '#16a34a' : '#dc2626';
  const title = success ? 'Google Ads connecte' : 'Connexion impossible';
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head>
    <body style="font-family:system-ui;padding:48px;text-align:center;color:#202331">
      <h1 style="color:${color};font-size:22px">${title}</h1><p>${safeMessage}</p>
      <p>Vous pouvez fermer cette fenetre.</p>
      <script>if(window.opener){window.opener.postMessage({type:'google-ads-oauth',success:${success}},'*')}setTimeout(()=>window.close(),1200)</script>
    </body></html>`, {
    status: success ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');
    if (oauthError) return resultPage(false, `Google a refuse l'autorisation : ${oauthError}`);
    if (!code || !state) return resultPage(false, 'Code ou etat OAuth manquant.');

    const stateHash = await sha256(state);
    const { data: oauthState, error: stateError } = await adminClient
      .from('google_ads_oauth_states')
      .select('id, workspace_id')
      .eq('state_hash', stateHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (stateError || !oauthState) return resultPage(false, 'Cette autorisation a expire. Relancez-la depuis le CRM.');

    const { data: consumed, error: consumeError } = await adminClient
      .from('google_ads_oauth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('id', oauthState.id)
      .is('used_at', null)
      .select('id')
      .maybeSingle();
    if (consumeError || !consumed) return resultPage(false, 'Cette autorisation a deja ete utilisee.');

    const connection = await getGoogleConnection(oauthState.workspace_id);
    const settings = (connection.settings ?? {}) as Record<string, unknown>;
    const clientId = String(settings.client_id ?? '');
    const clientSecret = await readGoogleSecret(oauthState.workspace_id, 'client_secret');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-ads-oauth-callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.refresh_token) {
      throw new Error(tokenPayload.error_description ?? tokenPayload.error ?? 'Google n\'a pas renvoye de refresh token');
    }

    await writeGoogleSecret(oauthState.workspace_id, 'refresh_token', tokenPayload.refresh_token);
    const { error: updateError } = await adminClient
      .from('integration_connections')
      .update({
        status: 'connected',
        last_tested_at: new Date().toISOString(),
        last_error: null,
        settings: {
          ...settings,
          refresh_token_ref: 'stored',
          oauth_connected_at: new Date().toISOString(),
          calendar_authorized_at: new Date().toISOString(),
        },
      })
      .eq('id', connection.id);
    if (updateError) throw new Error(updateError.message);

    return resultPage(true, 'L acces au compte a ete autorise.');
  } catch (error) {
    return resultPage(false, error instanceof Error ? error.message : String(error));
  }
});
