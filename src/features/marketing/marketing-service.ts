import { supabase } from '@/lib/supabase';

export interface MarketingTotals {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  appointments: number;
  interventions: number;
  googleConversions: number;
}

export interface MarketingCampaignRow extends MarketingTotals {
  id: string;
  name: string;
  status: string | null;
}

export interface MarketingDay {
  date: string;
  clicks: number;
  leads: number;
  interventions: number;
  spend: number;
}

export interface MarketingDashboardData {
  totals: MarketingTotals;
  campaigns: MarketingCampaignRow[];
  timeline: MarketingDay[];
  lastSyncedAt: string | null;
  exactAttributions: number;
  approximateAttributions: number;
}

type MetricRow = {
  metric_date: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string | null;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
  synced_at: string;
};

type LeadRow = {
  id: string;
  arrive_le: string;
  google_campaign_id: string | null;
  campaign_name: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
};

const emptyTotals = (): MarketingTotals => ({
  impressions: 0,
  clicks: 0,
  spend: 0,
  leads: 0,
  appointments: 0,
  interventions: 0,
  googleConversions: 0,
});

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('fr-FR');
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

export async function fetchMarketingDashboard(days: number): Promise<MarketingDashboardData> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const startDate = dayKey(start.toISOString());

  const [metricResult, leadResult] = await Promise.all([
    supabase
      .from('google_ads_daily_metrics')
      .select('metric_date,campaign_id,campaign_name,campaign_status,impressions,clicks,cost_micros,conversions,synced_at')
      .gte('metric_date', startDate)
      .order('metric_date', { ascending: true }),
    supabase
      .from('leads')
      .select('id,arrive_le,google_campaign_id,campaign_name,utm_campaign,gclid,gbraid,wbraid')
      .gte('arrive_le', start.toISOString())
      .or('gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null,google_campaign_id.not.is.null,utm_source.ilike.%google%,utm_medium.ilike.%cpc%'),
  ]);

  if (metricResult.error) throw new Error(metricResult.error.message);
  if (leadResult.error) throw new Error(leadResult.error.message);
  const metrics = (metricResult.data ?? []) as MetricRow[];
  const leads = (leadResult.data ?? []) as LeadRow[];
  const leadIds = leads.map((lead) => lead.id);

  const caseResult = leadIds.length
    ? await supabase.from('windscreen_cases').select('id,lead_id,status').in('lead_id', leadIds)
    : { data: [], error: null };
  if (caseResult.error) throw new Error(caseResult.error.message);
  const caseIds = (caseResult.data ?? []).map((item) => item.id);
  const appointmentFilter = [
    leadIds.length ? `lead_id.in.(${leadIds.join(',')})` : '',
    caseIds.length ? `case_id.in.(${caseIds.join(',')})` : '',
  ].filter(Boolean).join(',');
  const appointmentResult = appointmentFilter
    ? await supabase.from('appointments').select('lead_id,case_id,status,type').or(appointmentFilter)
    : { data: [], error: null };
  if (appointmentResult.error) throw new Error(appointmentResult.error.message);

  const cases = caseResult.data ?? [];
  const caseToLead = new Map(cases.map((item) => [item.id, item.lead_id]));
  const appointmentLeadIds = new Set<string>();
  for (const appointment of appointmentResult.data ?? []) {
    if (appointment.type !== 'intervention' || ['cancelled', 'no_show'].includes(appointment.status)) continue;
    const leadId = appointment.lead_id || (appointment.case_id ? caseToLead.get(appointment.case_id) : null);
    if (leadId) appointmentLeadIds.add(leadId);
  }

  const interventionStatuses = new Set([
    'intervention_done', 'invoice_sent', 'payment_pending', 'payment_received',
    'gift_given', 'sav', 'completed',
  ]);
  const interventionLeadIds = new Set(
    cases.filter((item) => item.lead_id && interventionStatuses.has(item.status)).map((item) => item.lead_id as string),
  );

  const campaigns = new Map<string, MarketingCampaignRow>();
  const nameToId = new Map<string, string>();
  const timeline = new Map<string, MarketingDay>();
  const ensureDay = (date: string) => {
    if (!timeline.has(date)) timeline.set(date, { date, clicks: 0, leads: 0, interventions: 0, spend: 0 });
    return timeline.get(date)!;
  };
  const ensureCampaign = (id: string, name: string, status: string | null = null) => {
    if (!campaigns.has(id)) campaigns.set(id, { id, name, status, ...emptyTotals() });
    return campaigns.get(id)!;
  };

  let lastSyncedAt: string | null = null;
  for (const metric of metrics) {
    const campaign = ensureCampaign(metric.campaign_id, metric.campaign_name, metric.campaign_status);
    nameToId.set(normalized(metric.campaign_name), metric.campaign_id);
    const impressions = Number(metric.impressions);
    const clicks = Number(metric.clicks);
    const spend = Number(metric.cost_micros) / 1_000_000;
    campaign.impressions += impressions;
    campaign.clicks += clicks;
    campaign.spend += spend;
    campaign.googleConversions += Number(metric.conversions);
    const day = ensureDay(metric.metric_date);
    day.clicks += clicks;
    day.spend += spend;
    if (!lastSyncedAt || metric.synced_at > lastSyncedAt) lastSyncedAt = metric.synced_at;
  }

  let exactAttributions = 0;
  let approximateAttributions = 0;
  for (const lead of leads) {
    let campaignId = lead.google_campaign_id;
    const exact = Boolean(campaignId || lead.gclid || lead.gbraid || lead.wbraid);
    if (!campaignId && lead.utm_campaign) campaignId = nameToId.get(normalized(lead.utm_campaign)) ?? `utm:${lead.utm_campaign}`;
    if (!campaignId) campaignId = '__google_non_attribue__';
    const label = lead.campaign_name || lead.utm_campaign || 'Google Ads — campagne non identifiée';
    const campaign = ensureCampaign(campaignId, label);
    campaign.leads++;
    if (appointmentLeadIds.has(lead.id)) campaign.appointments++;
    if (interventionLeadIds.has(lead.id)) campaign.interventions++;
    const day = ensureDay(dayKey(lead.arrive_le));
    day.leads++;
    if (interventionLeadIds.has(lead.id)) day.interventions++;
    if (exact) exactAttributions++; else approximateAttributions++;
  }

  const campaignRows = [...campaigns.values()].sort((a, b) => b.spend - a.spend || b.leads - a.leads);
  const totals = campaignRows.reduce((sum, campaign) => ({
    impressions: sum.impressions + campaign.impressions,
    clicks: sum.clicks + campaign.clicks,
    spend: sum.spend + campaign.spend,
    leads: sum.leads + campaign.leads,
    appointments: sum.appointments + campaign.appointments,
    interventions: sum.interventions + campaign.interventions,
    googleConversions: sum.googleConversions + campaign.googleConversions,
  }), emptyTotals());

  return {
    totals,
    campaigns: campaignRows,
    timeline: [...timeline.values()].sort((a, b) => a.date.localeCompare(b.date)),
    lastSyncedAt,
    exactAttributions,
    approximateAttributions,
  };
}
