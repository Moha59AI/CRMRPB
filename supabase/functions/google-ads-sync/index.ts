import {
  adminClient, automationAuthorized, cleanCustomerId, corsHeaders,
  createGoogleAdsSession, getGoogleConnection, googleAdsSearchWithSession,
  jsonResponse, requireAdmin, type GoogleAdsSession,
} from '../_shared/google-ads.ts';

type GoogleRow = {
  segments?: { date?: string };
  campaign?: { id?: string; name?: string; status?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
  };
  clickView?: { gclid?: string };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { ad?: { id?: string } };
};

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function enrichClickAttribution(
  workspaceId: string,
  session: GoogleAdsSession,
): Promise<number> {
  const since = new Date(Date.now() - 89 * 86_400_000).toISOString();
  const { data: leads, error } = await adminClient
    .from('leads')
    .select('id, gclid, arrive_le')
    .eq('workspace_id', workspaceId)
    .not('gclid', 'is', null)
    .is('google_campaign_id', null)
    .gte('arrive_le', since)
    .limit(500);
  if (error || !leads?.length) return 0;

  const byDate = new Map<string, typeof leads>();
  for (const lead of leads) {
    const day = dateOnly(lead.arrive_le);
    byDate.set(day, [...(byDate.get(day) ?? []), lead]);
  }

  let enriched = 0;
  for (const [day, dayLeads] of byDate) {
    for (const batch of chunks(dayLeads, 50)) {
      const ids = batch
        .map((lead) => String(lead.gclid).replace(/'/g, "\\'"))
        .map((gclid) => `'${gclid}'`)
        .join(', ');
      try {
        const rows = await googleAdsSearchWithSession(session, `
          SELECT click_view.gclid, campaign.id, campaign.name,
                 ad_group.id, ad_group.name, ad_group_ad.ad.id
          FROM click_view
          WHERE segments.date = '${day}' AND click_view.gclid IN (${ids})
        `) as GoogleRow[];

        for (const row of rows) {
          const gclid = row.clickView?.gclid;
          if (!gclid || !row.campaign?.id) continue;
          const { error: updateError } = await adminClient
            .from('leads')
            .update({
              google_campaign_id: row.campaign.id,
              google_ad_group_id: row.adGroup?.id ?? null,
              google_ad_id: row.adGroupAd?.ad?.id ?? null,
              campaign_name: row.campaign.name ?? null,
            })
            .eq('workspace_id', workspaceId)
            .eq('gclid', gclid);
          if (!updateError) enriched++;
        }
      } catch (error) {
        // L'enrichissement du clic est utile mais ne doit pas annuler les
        // statistiques de campagne deja recuperees.
        console.error(`Attribution ${day}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }
  return enriched;
}

async function syncWorkspace(workspaceId: string): Promise<{
  campaigns: number;
  enrichedLeads: number;
}> {
  const connection = await getGoogleConnection(workspaceId);
  const settings = (connection.settings ?? {}) as Record<string, unknown>;
  const session = await createGoogleAdsSession(workspaceId, settings);
  const rows = await googleAdsSearchWithSession(session, `
    SELECT segments.date, campaign.id, campaign.name, campaign.status,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_90_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
  `) as GoogleRow[];

  const metrics = rows
    .filter((row) => row.segments?.date && row.campaign?.id)
    .map((row) => ({
      workspace_id: workspaceId,
      connection_id: connection.id,
      customer_id: cleanCustomerId(String(settings.customer_id ?? '')),
      metric_date: row.segments?.date,
      campaign_id: row.campaign?.id,
      campaign_name: row.campaign?.name ?? `Campagne ${row.campaign?.id}`,
      campaign_status: row.campaign?.status ?? null,
      impressions: Number(row.metrics?.impressions ?? 0),
      clicks: Number(row.metrics?.clicks ?? 0),
      cost_micros: Number(row.metrics?.costMicros ?? 0),
      conversions: Number(row.metrics?.conversions ?? 0),
      conversion_value: Number(row.metrics?.conversionsValue ?? 0),
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

  for (const batch of chunks(metrics, 500)) {
    const { error } = await adminClient
      .from('google_ads_daily_metrics')
      .upsert(batch, { onConflict: 'connection_id,metric_date,campaign_id' });
    if (error) throw new Error(error.message);
  }

  const enrichedLeads = await enrichClickAttribution(workspaceId, session);
  const { error: updateError } = await adminClient
    .from('integration_connections')
    .update({
      status: 'connected',
      last_success_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', connection.id);
  if (updateError) throw new Error(updateError.message);

  return { campaigns: metrics.length, enrichedLeads };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    let workspaceIds: string[] = [];
    if (automationAuthorized(req)) {
      const { data, error } = await adminClient
        .from('integration_connections')
        .select('workspace_id')
        .eq('provider', 'google')
        .eq('status', 'connected');
      if (error) throw new Error(error.message);
      workspaceIds = [...new Set((data ?? []).map((row) => row.workspace_id))];
    } else {
      workspaceIds = [(await requireAdmin(req)).workspaceId];
    }

    const results = [];
    for (const workspaceId of workspaceIds) {
      try {
        results.push({ workspaceId, success: true, ...(await syncWorkspace(workspaceId)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await adminClient.from('integration_connections').update({
          status: 'error', last_error: message,
        }).eq('workspace_id', workspaceId).eq('provider', 'google');
        results.push({ workspaceId, success: false, error: message });
      }
    }

    const failed = results.filter((result) => !result.success);
    return jsonResponse({
      success: failed.length === 0,
      results,
      error: failed.length ? failed.map((result) => result.error).join(' | ') : null,
    }, failed.length ? 400 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
