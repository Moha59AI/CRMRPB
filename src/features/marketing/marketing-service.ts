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
  invoices: number;
  invoicedRevenue: number;
  creditedRevenue: number;
  creditsAlreadyDeductedFromMargin: number;
  netRevenue: number;
  collectedRevenue: number;
  estimatedMargin: number;
  marginKnownInvoices: number;
  revenueLinkedLeads: number;
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

export interface FinancialAttributionBreakdown {
  invoicesByCase: number;
  invoicesByContact: number;
  leadsWithInvoice: number;
  marginKnownInvoices: number;
  matchedInvoices: number;
}

export type MarketingLeadChannel = 'webhook' | 'telephone' | 'web';

export interface MarketingChannelRow {
  id: MarketingLeadChannel;
  label: string;
  leads: number;
  qualifiedLeads: number;
  transformedLeads: number;
  interventions: number;
  invoices: number;
  netRevenue: number;
  collectedRevenue: number;
  estimatedMargin: number;
}

export interface MarketingInvoiceDetail {
  id: string;
  number: string;
  status: string;
  amount: number;
  credited: number;
  netAmount: number;
  collected: number;
}

export interface MarketingTransformedCaseRow {
  id: string;
  leadId: string;
  caseId: string | null;
  customerName: string;
  arrivedAt: string;
  channel: MarketingLeadChannel;
  channelLabel: string;
  campaignName: string;
  caseNumber: string;
  caseStatus: string | null;
  glassLabel: string | null;
  invoices: MarketingInvoiceDetail[];
  invoicedRevenue: number;
  creditedRevenue: number;
  netRevenue: number;
  collectedRevenue: number;
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
  channels: MarketingChannelRow[];
  financialAttribution: FinancialAttributionBreakdown;
  transformedCases: MarketingTransformedCaseRow[];
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
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  arrive_le: string;
  status: string;
  google_campaign_id: string | null;
  campaign_name: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  contact_id: string | null;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  raw_payload: Record<string, unknown> | null;
};

type CandidateLeadRow = Pick<LeadRow, 'id' | 'arrive_le' | 'contact_id'>;

type CaseRow = {
  id: string;
  case_number: string;
  lead_id: string | null;
  contact_id: string | null;
  status: string;
};
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

type InvoiceRow = {
  id: string;
  invoice_number: string;
  case_id: string | null;
  contact_id: string | null;
  status: string;
  amount_ttc: number | string | null;
  amount_paid: number | string | null;
  estimated_margin: number | string | null;
  margin_known?: boolean;
  margin_includes_credits?: boolean;
  issue_date: string;
};

type ProfitabilityMarginRow = {
  invoice_id: string;
  actual_gross_margin_ht: number | string | null;
  supplier_cost_known: boolean;
};

type CreditRow = {
  invoice_id: string | null;
  contact_id: string | null;
  status: string | null;
  amount_ttc: number | string | null;
  issue_date: string | null;
  created_at: string;
};

type LeadFinance = {
  invoices: number;
  invoicedRevenue: number;
  creditedRevenue: number;
  creditsAlreadyDeductedFromMargin: number;
  collectedRevenue: number;
  estimatedMargin: number;
  marginKnownInvoices: number;
  invoicesByCase: number;
  invoicesByContact: number;
  invoiceDetails: MarketingInvoiceDetail[];
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
  invoices: 0,
  invoicedRevenue: 0,
  creditedRevenue: 0,
  creditsAlreadyDeductedFromMargin: 0,
  netRevenue: 0,
  collectedRevenue: 0,
  estimatedMargin: 0,
  marginKnownInvoices: 0,
  revenueLinkedLeads: 0,
});

const emptyAttribution = (): AttributionBreakdown => ({
  campaignExact: 0,
  clickCaptured: 0,
  utm: 0,
  unresolved: 0,
});

const emptyFinance = (): LeadFinance => ({
  invoices: 0,
  invoicedRevenue: 0,
  creditedRevenue: 0,
  creditsAlreadyDeductedFromMargin: 0,
  collectedRevenue: 0,
  estimatedMargin: 0,
  marginKnownInvoices: 0,
  invoicesByCase: 0,
  invoicesByContact: 0,
  invoiceDetails: [],
});

const channelLabels: Record<MarketingLeadChannel, string> = {
  webhook: 'Formulaires / webhook',
  telephone: 'Appels téléphoniques',
  web: 'Web Google Ads',
};

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

function numeric(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function leadChannel(lead: LeadRow): MarketingLeadChannel {
  const payload = lead.raw_payload ?? {};
  const originalChannel = normalized(String(
    payload.onify_channel ?? payload.channel ?? payload.canal ?? '',
  ));
  const medium = normalized(lead.utm_medium);
  if (originalChannel.includes('telephone') || originalChannel.includes('téléphone') || medium.includes('telephone')) {
    return 'telephone';
  }
  if (originalChannel.includes('webhook') || medium.includes('webhook') || lead.source === 'webhook') {
    return 'webhook';
  }
  return 'web';
}

function activeCredit(status: string | null): boolean {
  const value = normalized(status);
  return !value.includes('brouillon') && !value.includes('draft')
    && !value.includes('annul') && !value.includes('cancel');
}

function reconcileFinance(
  leads: LeadRow[],
  candidateLeads: CandidateLeadRow[],
  cases: CaseRow[],
  invoices: InvoiceRow[],
  credits: CreditRow[],
): Map<string, LeadFinance> {
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const caseToLead = new Map(cases
    .filter((item) => item.lead_id && leadById.has(item.lead_id))
    .map((item) => [item.id, item.lead_id as string]));
  const leadsByContact = new Map<string, CandidateLeadRow[]>();
  for (const lead of candidateLeads) {
    if (!lead.contact_id) continue;
    leadsByContact.set(lead.contact_id, [...(leadsByContact.get(lead.contact_id) ?? []), lead]);
  }
  for (const contactLeads of leadsByContact.values()) {
    contactLeads.sort((a, b) => b.arrive_le.localeCompare(a.arrive_le));
  }

  const financeByLead = new Map<string, LeadFinance>();
  const invoiceToLead = new Map<string, string>();
  const marginsIncludingCredits = new Set<string>();
  const ensureFinance = (leadId: string) => {
    if (!financeByLead.has(leadId)) financeByLead.set(leadId, emptyFinance());
    return financeByLead.get(leadId)!;
  };
  const leadForContact = (contactId: string | null, financialDate: string | null): string | null => {
    if (!contactId || !financialDate) return null;
    const date = new Date(financialDate);
    if (Number.isNaN(date.getTime())) return null;
    const candidate = (leadsByContact.get(contactId) ?? []).find((lead) => {
      const arrival = new Date(lead.arrive_le);
      const ageDays = (date.getTime() - arrival.getTime()) / 86_400_000;
      return ageDays >= -1 && ageDays <= 366;
    });
    return candidate && leadById.has(candidate.id) ? candidate.id : null;
  };

  for (const invoice of invoices) {
    if (invoice.status === 'cancelled') continue;
    const exactLeadId = invoice.case_id ? caseToLead.get(invoice.case_id) ?? null : null;
    const leadId = exactLeadId ?? leadForContact(invoice.contact_id, invoice.issue_date);
    if (!leadId) continue;
    invoiceToLead.set(invoice.id, leadId);
    const finance = ensureFinance(leadId);
    finance.invoices++;
    finance.invoicedRevenue += numeric(invoice.amount_ttc);
    finance.collectedRevenue += numeric(invoice.amount_paid);
    const margin = numeric(invoice.estimated_margin);
    finance.estimatedMargin += margin;
    if (invoice.margin_known ?? margin > 0) finance.marginKnownInvoices++;
    if (invoice.margin_includes_credits) marginsIncludingCredits.add(invoice.id);
    if (exactLeadId) finance.invoicesByCase++;
    else finance.invoicesByContact++;
    finance.invoiceDetails.push({
      id: invoice.id,
      number: invoice.invoice_number,
      status: invoice.status,
      amount: numeric(invoice.amount_ttc),
      credited: 0,
      netAmount: numeric(invoice.amount_ttc),
      collected: numeric(invoice.amount_paid),
    });
  }

  for (const credit of credits) {
    if (!activeCredit(credit.status)) continue;
    const leadId = (credit.invoice_id ? invoiceToLead.get(credit.invoice_id) ?? null : null)
      ?? leadForContact(credit.contact_id, credit.issue_date ?? credit.created_at);
    if (!leadId) continue;
    const finance = ensureFinance(leadId);
    const amount = numeric(credit.amount_ttc);
    finance.creditedRevenue += amount;
    if (credit.invoice_id && marginsIncludingCredits.has(credit.invoice_id)) {
      finance.creditsAlreadyDeductedFromMargin += amount;
    }
    if (credit.invoice_id) {
      const invoice = finance.invoiceDetails.find((item) => item.id === credit.invoice_id);
      if (invoice) {
        invoice.credited += amount;
        invoice.netAmount = invoice.amount - invoice.credited;
      }
    }
  }

  return financeByLead;
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

function campaignNameForLead(lead: LeadRow): string {
  if (lead.google_campaign_id) return lead.campaign_name || `Campagne ${lead.google_campaign_id}`;
  if (lead.utm_campaign) return lead.campaign_name || lead.utm_campaign;
  if (lead.gclid || lead.gbraid || lead.wbraid) return 'Clic Google — campagne à résoudre';
  return lead.campaign_name || 'Google Ads — campagne non identifiée';
}

function aggregatePeriod(
  metrics: MetricRow[],
  leads: LeadRow[],
  appointmentLeadIds: Set<string>,
  transformedLeadIds: Set<string>,
  interventionLeadIds: Set<string>,
  financeByLead: Map<string, LeadFinance>,
  timelineDates: string[] = [],
): {
  totals: MarketingTotals;
  campaigns: MarketingCampaignRow[];
  timeline: MarketingDay[];
  attribution: AttributionBreakdown;
  financialAttribution: FinancialAttributionBreakdown;
  channels: MarketingChannelRow[];
  lastSyncedAt: string | null;
} {
  const campaigns = new Map<string, MarketingCampaignRow>();
  const campaignNameToId = new Map<string, string>();
  const timeline = new Map<string, MarketingDay>();
  const attribution = emptyAttribution();
  const channels = new Map<MarketingLeadChannel, MarketingChannelRow>();
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
  const ensureChannel = (id: MarketingLeadChannel) => {
    if (!channels.has(id)) {
      channels.set(id, {
        id, label: channelLabels[id], leads: 0, qualifiedLeads: 0,
        transformedLeads: 0, interventions: 0, invoices: 0,
        netRevenue: 0, collectedRevenue: 0, estimatedMargin: 0,
      });
    }
    return channels.get(id)!;
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
    if (transformedLeadIds.has(lead.id)) campaign.transformedLeads++;
    if (pendingStatuses.has(lead.status)) campaign.pendingLeads++;
    if (lead.status === 'lost') campaign.lostLeads++;
    if (appointmentLeadIds.has(lead.id)) campaign.appointments++;
    if (interventionLeadIds.has(lead.id)) campaign.interventions++;
    const finance = financeByLead.get(lead.id);
    if (finance) {
      campaign.invoices += finance.invoices;
      campaign.invoicedRevenue += finance.invoicedRevenue;
      campaign.creditedRevenue += finance.creditedRevenue;
      campaign.creditsAlreadyDeductedFromMargin += finance.creditsAlreadyDeductedFromMargin;
      campaign.netRevenue += finance.invoicedRevenue - finance.creditedRevenue;
      campaign.collectedRevenue += finance.collectedRevenue;
      campaign.estimatedMargin += finance.estimatedMargin;
      campaign.marginKnownInvoices += finance.marginKnownInvoices;
      if (finance.invoices > 0) campaign.revenueLinkedLeads++;
    }

    const channel = ensureChannel(leadChannel(lead));
    channel.leads++;
    if (qualifiedStatuses.has(lead.status)) channel.qualifiedLeads++;
    if (transformedLeadIds.has(lead.id)) channel.transformedLeads++;
    if (interventionLeadIds.has(lead.id)) channel.interventions++;
    if (finance) {
      channel.invoices += finance.invoices;
      channel.netRevenue += finance.invoicedRevenue - finance.creditedRevenue;
      channel.collectedRevenue += finance.collectedRevenue;
      channel.estimatedMargin += finance.estimatedMargin;
    }

    const day = ensureDay(dayKey(lead.arrive_le));
    day.leads++;
    if (appointmentLeadIds.has(lead.id)) day.appointments++;
    if (interventionLeadIds.has(lead.id)) day.interventions++;
    if (transformedLeadIds.has(lead.id)) day.transformedLeads++;
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
    invoices: sum.invoices + campaign.invoices,
    invoicedRevenue: sum.invoicedRevenue + campaign.invoicedRevenue,
    creditedRevenue: sum.creditedRevenue + campaign.creditedRevenue,
    creditsAlreadyDeductedFromMargin: sum.creditsAlreadyDeductedFromMargin + campaign.creditsAlreadyDeductedFromMargin,
    netRevenue: sum.netRevenue + campaign.netRevenue,
    collectedRevenue: sum.collectedRevenue + campaign.collectedRevenue,
    estimatedMargin: sum.estimatedMargin + campaign.estimatedMargin,
    marginKnownInvoices: sum.marginKnownInvoices + campaign.marginKnownInvoices,
    revenueLinkedLeads: sum.revenueLinkedLeads + campaign.revenueLinkedLeads,
  }), emptyTotals());

  const financialAttribution = leads.reduce<FinancialAttributionBreakdown>((sum, lead) => {
    const finance = financeByLead.get(lead.id);
    if (!finance) return sum;
    sum.invoicesByCase += finance.invoicesByCase;
    sum.invoicesByContact += finance.invoicesByContact;
    sum.matchedInvoices += finance.invoices;
    sum.marginKnownInvoices += finance.marginKnownInvoices;
    if (finance.invoices > 0) sum.leadsWithInvoice++;
    return sum;
  }, { invoicesByCase: 0, invoicesByContact: 0, leadsWithInvoice: 0, marginKnownInvoices: 0, matchedInvoices: 0 });

  return {
    totals,
    campaigns: campaignRows,
    timeline: [...timeline.values()].sort((a, b) => a.date.localeCompare(b.date)),
    attribution,
    financialAttribution,
    channels: [...channels.values()].sort((a, b) => b.leads - a.leads),
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
      .select('id,first_name,last_name,phone,arrive_le,status,contact_id,source,google_campaign_id,campaign_name,utm_source,utm_medium,utm_campaign,gclid,gbraid,wbraid,raw_payload')
      .gte('arrive_le', previousStart.toISOString())
      .lt('arrive_le', endExclusive.toISOString())
      .or('source.eq.google_ads,gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null,google_campaign_id.not.is.null,utm_source.ilike.%google%,utm_medium.ilike.%cpc%'),
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
    ? await supabase.from('windscreen_cases').select('id,case_number,lead_id,contact_id,status').in('lead_id', leadIds)
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
  const transformedLeadIds = new Set([
    ...leads.filter((lead) => lead.status === 'converted').map((lead) => lead.id),
    ...cases.filter((item) => item.lead_id).map((item) => item.lead_id as string),
  ]);

  const contactIds = [...new Set(leads.map((lead) => lead.contact_id).filter((id): id is string => Boolean(id)))];
  const candidateLeadResult = contactIds.length
    ? await supabase
      .from('leads')
      .select('id,arrive_le,contact_id')
      .in('contact_id', contactIds)
      .lt('arrive_le', endExclusive.toISOString())
      .limit(5000)
    : { data: [] as CandidateLeadRow[], error: null };
  if (candidateLeadResult.error) throw new Error(candidateLeadResult.error.message);
  const financeFilter = [
    caseIds.length ? `case_id.in.(${caseIds.join(',')})` : '',
    contactIds.length ? `contact_id.in.(${contactIds.join(',')})` : '',
  ].filter(Boolean).join(',');
  const invoiceResult = financeFilter
    ? await supabase
      .from('invoices')
      .select('id,invoice_number,case_id,contact_id,status,amount_ttc,amount_paid,estimated_margin,issue_date')
      .or(financeFilter)
      .limit(5000)
    : { data: [] as InvoiceRow[], error: null };
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  const rawInvoices = (invoiceResult.data ?? []) as InvoiceRow[];
  const rawInvoiceIds = rawInvoices.map((invoice) => invoice.id);
  const profitabilityResult = rawInvoiceIds.length
    ? await supabase
      .from('v_financial_invoice_profitability')
      .select('invoice_id,actual_gross_margin_ht,supplier_cost_known')
      .in('invoice_id', rawInvoiceIds)
      .limit(5000)
    : { data: [] as ProfitabilityMarginRow[], error: null };
  if (profitabilityResult.error && !['42P01', 'PGRST200', 'PGRST205'].includes(profitabilityResult.error.code ?? '')) {
    throw new Error(profitabilityResult.error.message);
  }
  const actualMargins = new Map(
    ((profitabilityResult.data ?? []) as ProfitabilityMarginRow[])
      .filter((row) => row.supplier_cost_known && row.actual_gross_margin_ht != null)
      .map((row) => [row.invoice_id, row.actual_gross_margin_ht]),
  );
  const invoices = rawInvoices.map((invoice) => actualMargins.has(invoice.id) ? {
    ...invoice,
    estimated_margin: actualMargins.get(invoice.id) ?? invoice.estimated_margin,
    margin_known: true,
    margin_includes_credits: true,
  } : invoice);
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const creditFilter = [
    invoiceIds.length ? `invoice_id.in.(${invoiceIds.join(',')})` : '',
    contactIds.length ? `contact_id.in.(${contactIds.join(',')})` : '',
  ].filter(Boolean).join(',');
  const creditResult = creditFilter
    ? await supabase
      .from('onify_credit_notes')
      .select('invoice_id,contact_id,status,amount_ttc,issue_date,created_at')
      .or(creditFilter)
      .limit(5000)
    : { data: [] as CreditRow[], error: null };
  if (creditResult.error && !['42P01', 'PGRST205'].includes(creditResult.error.code ?? '')) {
    throw new Error(creditResult.error.message);
  }
  const financeByLead = reconcileFinance(
    leads, (candidateLeadResult.data ?? []) as CandidateLeadRow[], cases, invoices,
    (creditResult.data ?? []) as CreditRow[],
  );

  const currentMetrics = metrics.filter((metric) => metric.metric_date >= currentStartDate);
  const previousMetrics = metrics.filter((metric) => metric.metric_date < currentStartDate);
  const currentStartIso = currentStart.toISOString();
  const currentLeads = leads.filter((lead) => lead.arrive_le >= currentStartIso);
  const previousLeads = leads.filter((lead) => lead.arrive_le < currentStartIso);
  const timelineDates = Array.from({ length: days }, (_, index) => localDateKey(addDays(currentStart, index)));

  const current = aggregatePeriod(
    currentMetrics, currentLeads, appointmentLeadIds, transformedLeadIds,
    interventionLeadIds, financeByLead, timelineDates,
  );
  const previous = aggregatePeriod(
    previousMetrics, previousLeads, appointmentLeadIds, transformedLeadIds,
    interventionLeadIds, financeByLead,
  );
  const caseByLead = new Map(cases
    .filter((item) => item.lead_id)
    .map((item) => [item.lead_id as string, item]));
  const transformedCases = currentLeads
    .filter((lead) => transformedLeadIds.has(lead.id))
    .map<MarketingTransformedCaseRow>((lead) => {
      const dossier = caseByLead.get(lead.id);
      const finance = financeByLead.get(lead.id) ?? emptyFinance();
      const payload = lead.raw_payload ?? {};
      const onifyId = String(payload.onify_glass_dossier_id ?? '').trim();
      const customerName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim()
        || lead.phone
        || 'Client non identifié';
      const channel = leadChannel(lead);
      return {
        id: dossier?.id ?? `lead:${lead.id}`,
        leadId: lead.id,
        caseId: dossier?.id ?? null,
        customerName,
        arrivedAt: lead.arrive_le,
        channel,
        channelLabel: channelLabels[channel],
        campaignName: campaignNameForLead(lead),
        caseNumber: dossier?.case_number || (onifyId ? `Onify #${onifyId}` : 'Dossier sans numéro'),
        caseStatus: dossier?.status ?? (lead.status === 'converted' ? 'converted' : null),
        glassLabel: String(payload.onify_glass_label ?? '').trim() || null,
        invoices: finance.invoiceDetails,
        invoicedRevenue: finance.invoicedRevenue,
        creditedRevenue: finance.creditedRevenue,
        netRevenue: finance.invoicedRevenue - finance.creditedRevenue,
        collectedRevenue: finance.collectedRevenue,
      };
    })
    .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));

  return {
    totals: current.totals,
    previousTotals: previous.totals,
    campaigns: current.campaigns,
    timeline: current.timeline,
    lastSyncedAt: current.lastSyncedAt,
    attribution: current.attribution,
    searchTerms: aggregateSearchTerms((searchTermResult.data ?? []) as SearchTermMetricRow[]),
    searchTermsAvailable,
    channels: current.channels,
    financialAttribution: current.financialAttribution,
    transformedCases,
  };
}
