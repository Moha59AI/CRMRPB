import {
  adminClient, corsHeaders, getGoogleConnection, googleAdsSearch, jsonResponse,
  requireAdmin,
} from '../_shared/google-ads.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    const { workspaceId } = await requireAdmin(req);
    const connection = await getGoogleConnection(workspaceId);
    const settings = (connection.settings ?? {}) as Record<string, unknown>;
    const rows = await googleAdsSearch(workspaceId, settings, `
      SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone
      FROM customer
      LIMIT 1
    `);
    const customer = rows[0]?.customer as Record<string, unknown> | undefined;
    if (!customer) throw new Error('Le compte Google Ads ne renvoie aucune information');

    const { error: updateError } = await adminClient
      .from('integration_connections')
      .update({
        status: 'connected',
        last_tested_at: new Date().toISOString(),
        last_error: null,
        settings: {
          ...settings,
          customer_name: customer.descriptiveName ?? null,
          currency_code: customer.currencyCode ?? 'EUR',
          time_zone: customer.timeZone ?? 'Europe/Paris',
        },
      })
      .eq('id', connection.id);
    if (updateError) throw new Error(updateError.message);

    return jsonResponse({ success: true, customer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const { workspaceId } = await requireAdmin(req);
      await adminClient.from('integration_connections').update({
        status: 'error', last_tested_at: new Date().toISOString(), last_error: message,
      }).eq('workspace_id', workspaceId).eq('provider', 'google');
    } catch {
      // L'erreur d'authentification initiale reste la reponse utile.
    }
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return jsonResponse({ success: false, error: message }, status);
  }
});
