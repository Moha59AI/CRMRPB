import { supabase } from '@/lib/supabase';

export interface MarketingTotals {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  appointments: number;
  interventions: number;
  googleConversions: number;
  qualifiedLeads: number;
  transformedLeads: number;
  pendingLeads: number;
  lostLeads: number;
}

export interface MarketingCampaignRow extends MarketingTotals {
  id: string;
  name: string;
  status: string | null;
}

export interface MarketingDay {
  date: string;
  impressions: number;
  clicks: number;
  leads: number;
  appointments: number;
  interventions: number;
  transformedLeads: number;
  spend: number;
}

export interface AttributionBreakdown {
  campaignExact: number;
  clickCaptured: number;
  utm: number;
  unresolved: number;
}

export interface MarketingSearchTermRow {
  id: string;
  searchTerm: string;
  keywordText: string | null;
  keywordMatchType: string | null;
  searchTermMatchType: string | null;
  targetingStatus: string | null;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  devices: string[];
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

export interface MarketingDashboardData {
  totals: MarketingTotals;
  previousTotals: MarketingTotals;
  campaigns: MarketingCampaignRow[];
  timeline: MarketingDay[];
  lastSyncedAt: string | null;
  attribution: AttributionBreakdown;
  searchTerms: MarketingSearchTermRow[];
  searchTermsAvailable: boolean;
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
  status: string;
  google_campaign_id: string | null;
  campaign_name: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
};

type CaseRow = { id: string; lead_id: string | null; status: string };
type AppointmentRow = {
  lead_id: string | null;
  case_id: string | null;
  status: string;
  type: string;
};

type SearchTermMetricRow = {
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string;
  ad_group_name: string;
  search_term: string;
  keyword_text: string;
  keyword_match_type: string | null;
  search_term_match_type: string | null;
  targeting_status: string | null;
  device: string;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

const qualifiedStatuses = new Set([
  'interested', 'documents_requested', 'documents_received',
  'appointment_scheduled', 'converted',
]);
const pendingStatuses = new Set(['new', 'to_call', 'calling', 'nrp']);
const interventionStatuses = new Set([
  'intervention_done', 'invoice_sent', 'payment_pending', 'payment_received',
  'gift_given', 'sav', 'completed',
]);

const emptyTotals = (): MarketingTotals => ({
  impressions: 0,
  clicks: 0,
  spend: 0,
  leads: 0,
  appointments: 0,
  interventions: 0,
  googleConversions: 0,
  qualifiedLeads: 0,
  transformedLeads: 0,
  pendingLeads: 0,
  lostLeads: 0,
});

const emptyAttribution = (): AttributionBreakdown => ({
  campaignExact: 0,
  clickCaptured: 0,
  utm: 0,
  unresolved: 0,
});

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('fr-FR');
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function campaignForLead(
  lead: LeadRow,
  campaignNameToId: Map<string, string>,
  attribution: AttributionBreakdown,
): { id: string; name: string } {
  if (lead.google_campaign_id) {
    attribution.campaignExact++;
    return {
      id: lead.google_campaign_id,
      name: lead.campaign_name || `Campagne ${lead.google_campaign_id}`,
    };
  }
  if (lead.gclid || lead.gbraid || lead.wbraid) {
    attribution.clickCaptured++;
    return { id: '__clic_a_resoudre__', name: 'Google Ads — clic capturé, campagne à résoudre' };
  }
  if (lead.utm_campaign) {
    attribution.utm++;
    return {
      id: campaignNameToId.get(normalized(lead.utm_campaign)) ?? `utm:${lead.utm_campaign}`,
      name: lead.campaign_name || lead.utm_campaign,
    };
  }
  attribution.unresolved++;
  return { id: '__google_non_attribue__', name: 'Google Ads — campagne non identifiée' };
}

function aggregatePeriod(
  metrics: MetricRow[],
  leads: LeadRow[],
  appointmentLeadIds: Set<string>,
  interventionLeadIds: Set<string>,
  timelineDates: string[] = [],
): {
  totals: MarketingTotals;
  campaigns: MarketingCampaignRow[];
  timeline: MarketingDay[];
  attribution: AttributionBreakdown;
  lastSyncedAt: string | null;
} {
  const campaigns = new Map<string, MarketingCampaignRow>();
  const campaignNameToId = new Map<string, string>();
  const timeline = new Map<string, MarketingDay>();
  const attribution = emptyAttribution();
  const ensureDay = (date: string) => {
    if (!timeline.has(date)) {
      timeline.set(date, {
        date, impressions: 0, clicks: 0, leads: 0,
        appointments: 0, interventions: 0, transformedLeads: 0, spend: 0,
      });
    }
    return timeline.get(date)!;
  };
  const ensureCampaign = (id: string, name: string, status: string | null = null) => {
    if (!campaigns.has(id)) campaigns.set(id, { id, name, status, ...emptyTotals() });
    const campaign = campaigns.get(id)!;
    if (status) campaign.status = status;
    return campaign;
  };

  for (const date of timelineDates) ensureDay(date);

  let lastSyncedAt: string | null = null;
  for (const metric of metrics) {
    const campaign = ensureCampaign(metric.campaign_id, metric.campaign_name, metric.campaign_status);
    campaignNameToId.set(normalized(metric.campaign_name), metric.campaign_id);
    const impressions = Number(metric.impressions);
    const clicks = Number(metric.clicks);
    const spend = Number(metric.cost_micros) / 1_000_000;
    campaign.impressions += impressions;
    campaign.clicks += clicks;
    campaign.spend += spend;
    campaign.googleConversions += Number(metric.conversions);
    const day = ensureDay(metric.metric_date);
    day.impressions += impressions;
    day.clicks += clicks;
    day.spend += spend;
    if (!lastSyncedAt || metric.synced_at > lastSyncedAt) lastSyncedAt = metric.synced_at;
  }

  for (const lead of leads) {
    const attributed = campaignForLead(lead, campaignNameToId, attribution);
    const campaign = ensureCampaign(attributed.id, attributed.name);
    campaign.leads++;
    if (qualifiedStatuses.has(lead.status)) campaign.qualifiedLeads++;
    if (lead.status === 'converted') campaign.transformedLeads++;
    if (pendingStatuses.has(lead.status)) campaign.pendingLeads++;
    if (lead.status === 'lost') campaign.lostLeads++;
    if (appointmentLeadIds.has(lead.id)) campaign.appointments++;
    if (interventionLeadIds.has(lead.id)) campaign.interventions++;

    const day = ensureDay(dayKey(lead.arrive_le));
    day.leads++;
    if (appointmentLeadIds.has(lead.id)) day.appointments++;
    if (interventionLeadIds.has(lead.id)) day.interventions++;
    if (lead.status === 'converted') day.transformedLeads++;
  }

  const campaignRows = [...campaigns.values()]
    .sort((a, b) => b.spend - a.spend || b.leads - a.leads);
  const totals = campaignRows.reduce((sum, campaign) => ({
    impressions: sum.impressions + campaign.impressions,
    clicks: sum.clicks + campaign.clicks,
    spend: sum.spend + campaign.spend,
    leads: sum.leads + campaign.leads,
    appointments: sum.appointments + campaign.appointments,
    interventions: sum.interventions + campaign.interventions,
    googleConversions: sum.googleConversions + campaign.googleConversions,
    qualifiedLeads: sum.qualifiedLeads + campaign.qualifiedLeads,
    transformedLeads: sum.transformedLeads + campaign.transformedLeads,
    pendingLeads: sum.pendingLeads + campaign.pendingLeads,
    lostLeads: sum.lostLeads + campaign.lostLeads,
  }), emptyTotals());

  return {
    totals,
    campaigns: campaignRows,
    timeline: [...timeline.values()].sort((a, b) => a.date.localeCompare(b.date)),
    attribution,
    lastSyncedAt,
  };
}

function aggregateSearchTerms(rows: SearchTermMetricRow[]): MarketingSearchTermRow[] {
  const terms = new Map<string, MarketingSearchTermRow>();
  for (const row of rows) {
    const id = [
      row.campaign_id, row.ad_group_id, row.search_term, row.keyword_text,
      row.keyword_match_type, row.search_term_match_type, row.targeting_status,
    ].join('|');
    if (!terms.has(id)) {
      terms.set(id, {
        id,
        searchTerm: row.search_term,
        keywordText: row.keyword_text || null,
        keywordMatchType: row.keyword_match_type,
        searchTermMatchType: row.search_term_match_type,
        targetingStatus: row.targeting_status,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        adGroupId: row.ad_group_id,
        adGroupName: row.ad_group_name,
        devices: [],
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
      });
    }
    const term = terms.get(id)!;
    if (!term.devices.includes(row.device)) term.devices.push(row.device);
    term.impressions += Number(row.impressions);
    term.clicks += Number(row.clicks);
    term.spend += Number(row.cost_micros) / 1_000_000;
    term.conversions += Number(row.conversions);
  }
  return [...terms.values()].sort((a, b) => b.spend - a.spend || b.clicks - a.clicks);
}

export async function fetchMarketingDashboard(days: number): Promise<MarketingDashboardData> {
  const endExclusive = new Date();
  endExclusive.setHours(0, 0, 0, 0);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const currentStart = addDays(endExclusive, -days);
  const previousStart = addDays(currentStart, -days);
  const currentStartDate = localDateKey(currentStart);
  const previousStartDate = localDateKey(previousStart);
  const endDate = localDateKey(addDays(endExclusive, -1));

  const [metricResult, leadResult, searchTermResult] = await Promise.all([
    supabase
      .from('google_ads_daily_metrics')
      .select('metric_date,campaign_id,campaign_name,campaign_status,impressions,clicks,cost_micros,conversions,synced_at')
      .gte('metric_date', previousStartDate)
      .lte('metric_date', endDate)
      .order('metric_date', { ascending: true }),
    supabase
      .from('leads')
      .select('id,arrive_le,status,google_campaign_id,campaign_name,utm_campaign,gclid,gbraid,wbraid')
      .gte('arrive_le', previousStart.toISOString())
      .lt('arrive_le', endExclusive.toISOString())
      .or('gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null,google_campaign_id.not.is.null,utm_source.ilike.%google%,utm_medium.ilike.%cpc%'),
    supabase
      .from('google_ads_search_terms_daily')
      .select('campaign_id,campaign_name,ad_group_id,ad_group_name,search_term,keyword_text,keyword_match_type,search_term_match_type,targeting_status,device,impressions,clicks,cost_micros,conversions')
      .gte('metric_date', currentStartDate),
  ]);

  if (metricResult.error) throw new Error(metricResult.error.message);
  if (leadResult.error) throw new Error(leadResult.error.message);
  const searchTermsAvailable = !searchTermResult.error;
  if (searchTermResult.error && !['42P01', 'PGRST205'].includes(searchTermResult.error.code ?? '')) {
    throw new Error(searchTermResult.error.message);
  }
  const metrics = (metricResult.data ?? []) as MetricRow[];
  const leads = (leadResult.data ?? []) as LeadRow[];
  const leadIds = leads.map((lead) => lead.id);

  const caseResult = leadIds.length
    ? await supabase.from('windscreen_cases').select('id,lead_id,status').in('lead_id', leadIds)
    : { data: [] as CaseRow[], error: null };
  if (caseResult.error) throw new Error(caseResult.error.message);
  const cases = (caseResult.data ?? []) as CaseRow[];
  const caseIds = cases.map((item) => item.id);
  const appointmentFilter = [
    leadIds.length ? `lead_id.in.(${leadIds.join(',')})` : '',
    caseIds.length ? `case_id.in.(${caseIds.join(',')})` : '',
  ].filter(Boolean).join(',');
  const appointmentResult = appointmentFilter
    ? await supabase.from('appointments').select('lead_id,case_id,status,type').or(appointmentFilter)
    : { data: [] as AppointmentRow[], error: null };
  if (appointmentResult.error) throw new Error(appointmentResult.error.message);

  const caseToLead = new Map(cases.map((item) => [item.id, item.lead_id]));
  const appointmentLeadIds = new Set<string>();
  for (const appointment of (appointmentResult.data ?? []) as AppointmentRow[]) {
    if (appointment.type !== 'intervention' || ['cancelled', 'no_show'].includes(appointment.status)) continue;
    const leadId = appointment.lead_id || (appointment.case_id ? caseToLead.get(appointment.case_id) : null);
    if (leadId) appointmentLeadIds.add(leadId);
  }
  const interventionLeadIds = new Set(
    cases
      .filter((item) => item.lead_id && interventionStatuses.has(item.status))
      .map((item) => item.lead_id as string),
  );

  const currentMetrics = metrics.filter((metric) => metric.metric_date >= currentStartDate);
  const previousMetrics = metrics.filter((metric) => metric.metric_date < currentStartDate);
  const currentStartIso = currentStart.toISOString();
  const currentLeads = leads.filter((lead) => lead.arrive_le >= currentStartIso);
  const previousLeads = leads.filter((lead) => lead.arrive_le < currentStartIso);
  const timelineDates = Array.from({ length: days }, (_, index) => localDateKey(addDays(currentStart, index)));

  const current = aggregatePeriod(
    currentMetrics, currentLeads, appointmentLeadIds, interventionLeadIds, timelineDates,
  );
  const previous = aggregatePeriod(
    previousMetrics, previousLeads, appointmentLeadIds, interventionLeadIds,
  );

  return {
    totals: current.totals,
    previousTotals: previous.totals,
    campaigns: current.campaigns,
    timeline: current.timeline,
    lastSyncedAt: current.lastSyncedAt,
    attribution: current.attribution,
    searchTerms: aggregateSearchTerms((searchTermResult.data ?? []) as SearchTermMetricRow[]),
    searchTermsAvailable,
  };
}
