import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowUpRight, BadgeEuro, CalendarCheck2, CircleDollarSign, Coins,
  Download, Gauge, Globe2, Link2, MousePointerClick, PhoneCall,
  ReceiptText, RefreshCw, Settings2, Target, TrendingUp, TriangleAlert, UserCheck,
  UserPlus, Webhook, Wrench,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import { syncGoogleAds } from '@/features/integrations/google/google-ads-service';
import {
  fetchMarketingDashboard, type MarketingCampaignRow, type MarketingDashboardData,
  type MarketingSearchTermRow, type MarketingTransformedCaseRow,
} from './marketing-service';

const chartConfig = {
  clicks: { label: 'Clics', color: 'hsl(var(--chart-2))' },
  leads: { label: 'Leads', color: 'hsl(var(--chart-1))' },
  transformedLeads: { label: 'Dossiers Glass', color: 'hsl(var(--chart-4))' },
  interventions: { label: 'Interventions', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('fr-FR');
}

function ratio(value: number, total: number): string {
  return total > 0 ? percent.format(value / total) : '—';
}

function cost(value: number, count: number): string {
  return count > 0 ? euro.format(value / count) : '—';
}

function multiple(value: number, reference: number): string {
  return reference > 0 ? `${decimal.format(value / reference)}×` : '—';
}

function marginAfterAdvertising(value: {
  estimatedMargin: number;
  creditedRevenue: number;
  creditsAlreadyDeductedFromMargin: number;
  spend: number;
}): number {
  const creditsNotYetDeducted = Math.max(0, value.creditedRevenue - value.creditsAlreadyDeductedFromMargin);
  return value.estimatedMargin - creditsNotYetDeducted - value.spend;
}

function variation(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? 'stable' : 'nouveau';
  const value = (current - previous) / Math.abs(previous);
  return `${value >= 0 ? '+' : ''}${percent.format(value)} vs période préc.`;
}

function csvCell(value: string | number): string {
  const text = String(value).replace(/"/g, '""');
  return /[;"\n]/.test(text) ? `"${text}"` : text;
}

function exportCampaigns(campaigns: MarketingCampaignRow[], days: number) {
  const headers = [
    'Campagne', 'ID', 'Statut', 'Dépenses', 'Impressions', 'Clics', 'CTR', 'CPC',
    'Conversions Google', 'Leads CRM', 'Taux clic vers lead', 'CPL', 'Qualifiés',
    'Rendez-vous', 'Dossiers Glass', 'Interventions', 'Coût par intervention',
    'Factures rapprochées', 'CA net après avoirs', 'Encaissé', 'ROAS CRM',
    'Marge estimée', 'Résultat marge après avoirs et Ads',
  ];
  const rows = campaigns.map((campaign) => [
    campaign.name,
    campaign.id,
    campaign.status ?? '',
    campaign.spend.toFixed(2).replace('.', ','),
    campaign.impressions,
    campaign.clicks,
    campaign.impressions > 0 ? (campaign.clicks / campaign.impressions * 100).toFixed(2).replace('.', ',') : '',
    campaign.clicks > 0 ? (campaign.spend / campaign.clicks).toFixed(2).replace('.', ',') : '',
    campaign.googleConversions,
    campaign.leads,
    campaign.clicks > 0 ? (campaign.leads / campaign.clicks * 100).toFixed(2).replace('.', ',') : '',
    campaign.leads > 0 ? (campaign.spend / campaign.leads).toFixed(2).replace('.', ',') : '',
    campaign.qualifiedLeads,
    campaign.appointments,
    campaign.transformedLeads,
    campaign.interventions,
    campaign.interventions > 0 ? (campaign.spend / campaign.interventions).toFixed(2).replace('.', ',') : '',
    campaign.invoices,
    campaign.netRevenue.toFixed(2).replace('.', ','),
    campaign.collectedRevenue.toFixed(2).replace('.', ','),
    campaign.spend > 0 ? (campaign.netRevenue / campaign.spend).toFixed(2).replace('.', ',') : '',
    campaign.estimatedMargin.toFixed(2).replace('.', ','),
    campaign.marginKnownInvoices > 0
      ? marginAfterAdvertising(campaign).toFixed(2).replace('.', ',')
      : '',
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `marketing-google-ads-${days}-jours.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSearchTerms(terms: MarketingSearchTermRow[]) {
  const headers = [
    'Terme recherché', 'Mot-clé', 'Correspondance mot-clé', 'Correspondance terme',
    'Statut de ciblage', 'Campagne', 'Groupe d’annonces', 'Appareils', 'Impressions',
    'Clics', 'CTR', 'Coût', 'CPC', 'Conversions', 'Coût par conversion',
  ];
  const rows = terms.map((term) => [
    term.searchTerm,
    term.keywordText ?? '',
    term.keywordMatchType ?? '',
    term.searchTermMatchType ?? '',
    term.targetingStatus ?? '',
    term.campaignName,
    term.adGroupName,
    term.devices.join(', '),
    term.impressions,
    term.clicks,
    term.impressions ? (term.clicks / term.impressions * 100).toFixed(2).replace('.', ',') : '',
    term.spend.toFixed(2).replace('.', ','),
    term.clicks ? (term.spend / term.clicks).toFixed(2).replace('.', ',') : '',
    term.conversions,
    term.conversions ? (term.spend / term.conversions).toFixed(2).replace('.', ',') : '',
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'google-ads-termes-de-recherche.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function campaignStatus(status: string | null): { label: string; className: string } {
  switch (status) {
    case 'ENABLED': return { label: 'Active', className: 'bg-success/10 text-success' };
    case 'PAUSED': return { label: 'En pause', className: 'bg-warning/10 text-warning' };
    case 'REMOVED': return { label: 'Supprimée', className: 'bg-muted text-muted-foreground' };
    default: return { label: 'CRM uniquement', className: 'bg-muted text-muted-foreground' };
  }
}

export function MarketingPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ['marketing-dashboard', days],
    queryFn: () => fetchMarketingDashboard(days),
    refetchInterval: 60_000,
  });
  const sync = useMutation({
    mutationFn: syncGoogleAds,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketing-dashboard'] });
      toast.success('Google Ads synchronisé');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Synchronisation impossible'),
  });

  const data = query.data;
  const totals = data?.totals;
  const previous = data?.previousTotals;

  return (
    <>
      <PageHeader
        title="Marketing"
        description="Du clic publicitaire à l'intervention réalisée"
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-[132px] flex-1 rounded-full sm:flex-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="30">30 jours</SelectItem>
                <SelectItem value="90">90 jours</SelectItem>
              </SelectContent>
            </Select>
            {data && data.campaigns.length > 0 && (
              <Button
                variant="outline"
                className="flex-1 rounded-full sm:flex-none"
                onClick={() => exportCampaigns(data.campaigns, days)}
              >
                <Download className="mr-2 h-4 w-4" />
                Exporter
              </Button>
            )}
            {profile?.role === 'admin' && (
              <Button variant="outline" className="flex-1 rounded-full sm:flex-none" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
                <span className="sm:hidden">Actualiser</span>
                <span className="hidden sm:inline">Actualiser Google</span>
              </Button>
            )}
            {profile?.role === 'admin' && (
              <Button asChild variant="outline" size="icon" className="rounded-full">
                <Link to="/settings/integrations/google" aria-label="Configurer Google Ads">
                  <Settings2 className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="gutter-x space-y-5 py-4 sm:py-6">
          {query.isLoading && <LoadingDashboard />}

          {query.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Le suivi Marketing n'est pas encore prêt</AlertTitle>
              <AlertDescription>
                {(query.error as Error).message}. Appliquez d'abord le SQL Google Ads dans Supabase.
              </AlertDescription>
            </Alert>
          )}

          {data && totals && (
            <div
              key={`${days}-${data.lastSyncedAt ?? 'crm'}`}
              className="space-y-5 animate-marketing-dashboard"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Mise à jour automatique toutes les 15 minutes · écran rafraîchi chaque minute
                </span>
                <span>
                  Dernière donnée Google : {data.lastSyncedAt
                    ? new Date(data.lastSyncedAt).toLocaleString('fr-FR')
                    : 'pas encore synchronisée'}
                </span>
              </div>

              <div className="marketing-kpi-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                <Kpi
                  icon={CircleDollarSign}
                  label="Dépenses"
                  value={euro.format(totals.spend)}
                  detail={`${cost(totals.spend * 1000, totals.impressions)} CPM`}
                  trend={previous ? variation(totals.spend, previous.spend) : undefined}
                />
                <Kpi
                  icon={MousePointerClick}
                  label="Clics"
                  value={integer.format(totals.clicks)}
                  detail={`${ratio(totals.clicks, totals.impressions)} CTR · ${cost(totals.spend, totals.clicks)} CPC`}
                  trend={previous ? variation(totals.clicks, previous.clicks) : undefined}
                />
                <Kpi
                  icon={UserPlus}
                  label="Leads CRM"
                  value={integer.format(totals.leads)}
                  detail={`${cost(totals.spend, totals.leads)} CPL · ${ratio(totals.leads, totals.clicks)} des clics`}
                  trend={previous ? variation(totals.leads, previous.leads) : undefined}
                />
                <Kpi
                  icon={UserCheck}
                  label="Leads qualifiés"
                  value={integer.format(totals.qualifiedLeads)}
                  detail={`${ratio(totals.qualifiedLeads, totals.leads)} des leads`}
                  trend={previous ? variation(totals.qualifiedLeads, previous.qualifiedLeads) : undefined}
                />
                <Kpi
                  icon={CalendarCheck2}
                  label="Rendez-vous"
                  value={integer.format(totals.appointments)}
                  detail={`${cost(totals.spend, totals.appointments)} / RDV · ${ratio(totals.appointments, totals.leads)} des leads`}
                  trend={previous ? variation(totals.appointments, previous.appointments) : undefined}
                />
                <Kpi
                  icon={Target}
                  label="Dossiers Glass"
                  value={integer.format(totals.transformedLeads)}
                  detail={`${cost(totals.spend, totals.transformedLeads)} / transformation · ${ratio(totals.transformedLeads, totals.leads)} des leads`}
                  trend={previous ? variation(totals.transformedLeads, previous.transformedLeads) : undefined}
                />
                <Kpi
                  icon={Wrench}
                  label="Interventions"
                  value={integer.format(totals.interventions)}
                  detail={`${cost(totals.spend, totals.interventions)} / intervention`}
                  trend={previous ? variation(totals.interventions, previous.interventions) : undefined}
                />
              </div>

              <ProfitabilitySection data={data} />

              <TransformedCasesSection cases={data.transformedCases} />

              <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
                <Card className="marketing-card marketing-chart-card rounded-xl p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Performance dans le temps</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Résultats CRM rattachés au jour d'arrivée du lead, pour lire les cohortes d'acquisition
                      </p>
                    </div>
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <ChartContainer config={chartConfig} className="h-[285px] w-full aspect-auto">
                    <AreaChart data={data.timeline} margin={{ left: -18, right: 8 }}>
                      <defs>
                        <linearGradient id="fillClicks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-clicks)" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="var(--color-clicks)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR')} />} />
                      <Area dataKey="clicks" type="monotone" fill="url(#fillClicks)" stroke="var(--color-clicks)" strokeWidth={2} animationDuration={850} />
                      <Area dataKey="leads" type="monotone" fill="transparent" stroke="var(--color-leads)" strokeWidth={2} animationDuration={900} />
                      <Area dataKey="transformedLeads" type="monotone" fill="transparent" stroke="var(--color-transformedLeads)" strokeWidth={2} animationDuration={950} />
                      <Area dataKey="interventions" type="monotone" fill="transparent" stroke="var(--color-interventions)" strokeWidth={2} animationDuration={1000} />
                    </AreaChart>
                  </ChartContainer>
                </Card>

                <Card className="marketing-card rounded-xl p-5">
                  <h2 className="text-sm font-semibold">Entonnoir de conversion</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Chaque étape est issue des données réelles du CRM</p>
                  <div className="mt-6 space-y-5">
                    <FunnelStep label="Clics" value={totals.clicks} reference={totals.clicks} color="bg-upcoming" />
                    <FunnelStep label="Leads reçus" value={totals.leads} reference={totals.clicks} color="bg-primary" />
                    <FunnelStep label="Leads qualifiés" value={totals.qualifiedLeads} reference={totals.clicks} color="bg-primary" />
                    <FunnelStep label="Rendez-vous" value={totals.appointments} reference={totals.clicks} color="bg-due" />
                    <FunnelStep label="Dossiers Glass créés" value={totals.transformedLeads} reference={totals.clicks} color="bg-upcoming" />
                    <FunnelStep label="Interventions réalisées" value={totals.interventions} reference={totals.clicks} color="bg-done" />
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/60 p-3">
                      <span className="text-muted-foreground">À travailler</span>
                      <p className="mt-1 font-semibold tabular-nums">{integer.format(totals.pendingLeads)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-3">
                      <span className="text-muted-foreground">Perdus</span>
                      <p className="mt-1 font-semibold tabular-nums">{integer.format(totals.lostLeads)}</p>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <AttributionCard data={data} />
                <MediaBuyingSignals data={data} />
              </div>

              <Card className="marketing-card overflow-hidden rounded-xl">
                <div className="border-b border-border p-5">
                  <h2 className="text-sm font-semibold">Résultat par campagne</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Les coûts viennent de Google Ads ; les leads, rendez-vous et interventions viennent du CRM.</p>
                </div>
                {data.campaigns.length ? <CampaignTable campaigns={data.campaigns} /> : (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Aucune donnée Google Ads sur cette période. Configurez la connexion puis lancez une synchronisation.
                  </div>
                )}
              </Card>

              <SearchTermsSection terms={data.searchTerms} available={data.searchTermsAvailable} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, detail, trend }: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  detail: string;
  trend?: string;
}) {
  return (
    <Card className="marketing-kpi rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="marketing-kpi-icon rounded-lg bg-primary/10 p-1.5 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {trend && <p className="mt-2 text-[11px] font-medium text-foreground/70">{trend}</p>}
    </Card>
  );
}

function FunnelStep({ label, value, reference, color }: {
  label: string;
  value: number;
  reference: number;
  color: string;
}) {
  const width = reference > 0 ? Math.max(4, (value / reference) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{integer.format(value)} · {ratio(value, reference)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`animate-marketing-bar h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function CampaignTable({ campaigns }: { campaigns: MarketingCampaignRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[260px]">Campagne</TableHead>
            <TableHead className="text-right">Dépenses</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">Clics</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Conv. Google</TableHead>
            <TableHead className="text-right">Leads CRM</TableHead>
            <TableHead className="text-right">Taux lead</TableHead>
            <TableHead className="text-right">CPL</TableHead>
            <TableHead className="text-right">Qualifiés</TableHead>
            <TableHead className="text-right">RDV</TableHead>
            <TableHead className="text-right">Dossiers Glass</TableHead>
            <TableHead className="text-right">Interv.</TableHead>
            <TableHead className="text-right">Coût / interv.</TableHead>
            <TableHead className="text-right">CA net</TableHead>
            <TableHead className="text-right">Encaissé</TableHead>
            <TableHead className="text-right">ROAS CRM</TableHead>
            <TableHead className="text-right">Marge après pub</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => {
            const status = campaignStatus(campaign.status);
            return (
              <TableRow
                key={campaign.id}
                className={`marketing-table-row ${campaign.spend > 0 && campaign.leads === 0 ? 'bg-warning/5' : ''}`}
              >
                <TableCell>
                  <div className="max-w-[300px]">
                    <p className="truncate text-sm font-medium">{campaign.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className={`rounded-full text-[10px] ${status.className}`}>{status.label}</Badge>
                      {!campaign.id.startsWith('__') && !campaign.id.startsWith('utm:') && (
                        <span className="text-[10px] text-muted-foreground">{campaign.id}</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{euro.format(campaign.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">{ratio(campaign.clicks, campaign.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">{cost(campaign.spend, campaign.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.googleConversions)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.leads)}</TableCell>
                <TableCell className="text-right tabular-nums">{ratio(campaign.leads, campaign.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">{cost(campaign.spend, campaign.leads)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.qualifiedLeads)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.appointments)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{integer.format(campaign.transformedLeads)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{integer.format(campaign.interventions)}</TableCell>
                <TableCell className="text-right tabular-nums">{cost(campaign.spend, campaign.interventions)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{euro.format(campaign.netRevenue)}</TableCell>
                <TableCell className="text-right tabular-nums">{euro.format(campaign.collectedRevenue)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{multiple(campaign.netRevenue, campaign.spend)}</TableCell>
                <TableCell className={`text-right tabular-nums font-medium ${
                  campaign.marginKnownInvoices > 0
                    && marginAfterAdvertising(campaign) < 0
                    ? 'text-destructive' : 'text-success'
                }`}>
                  {campaign.marginKnownInvoices > 0
                    ? euro.format(marginAfterAdvertising(campaign))
                    : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ProfitabilitySection({ data }: { data: MarketingDashboardData }) {
  const { totals, channels, financialAttribution } = data;
  const marginAfterAds = marginAfterAdvertising(totals);
  const hasKnownMargin = totals.marginKnownInvoices > 0;
  const invoiceCoverage = ratio(financialAttribution.leadsWithInvoice, totals.transformedLeads);
  const marginCoverage = ratio(totals.marginKnownInvoices, totals.invoices);
  const channelIcons = { webhook: Webhook, telephone: PhoneCall, web: Globe2 } as const;

  return (
    <Card className="marketing-card overflow-hidden rounded-xl border-primary/20">
      <div className="border-b border-border bg-primary/[0.03] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BadgeEuro className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Rentabilité Google Ads rapprochée au CRM</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Les factures et avoirs sont rattachés au dossier Glass en priorité, puis au client par téléphone ou e-mail.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit rounded-full">
            {integer.format(financialAttribution.matchedInvoices)} facture{financialAttribution.matchedInvoices > 1 ? 's' : ''} rapprochée{financialAttribution.matchedInvoices > 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProfitMetric
            icon={CircleDollarSign}
            label="CA net attribué"
            value={euro.format(totals.netRevenue)}
            detail={`${euro.format(totals.invoicedRevenue)} facturé − ${euro.format(totals.creditedRevenue)} d'avoirs`}
          />
          <ProfitMetric
            icon={Coins}
            label="Déjà encaissé"
            value={euro.format(totals.collectedRevenue)}
            detail={`${ratio(totals.collectedRevenue, totals.netRevenue)} du CA net attribué`}
          />
          <ProfitMetric
            icon={TrendingUp}
            label="ROAS CRM"
            value={multiple(totals.netRevenue, totals.spend)}
            detail={`${euro.format(totals.netRevenue)} de CA net pour ${euro.format(totals.spend)} de publicité`}
          />
          <ProfitMetric
            icon={Gauge}
            label="Marge connue après pub"
            value={hasKnownMargin ? euro.format(marginAfterAds) : 'À compléter'}
            detail={hasKnownMargin
              ? `${marginCoverage} des factures ont une marge · avoirs et Ads déduits`
              : 'La marge des factures rapprochées n’est pas renseignée'}
            tone={!hasKnownMargin ? 'default' : marginAfterAds < 0 ? 'danger' : 'success'}
          />
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-x-auto p-5">
          <h3 className="text-sm font-semibold">Résultat par origine du lead Google</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Les dépenses restent au niveau campagne : elles ne sont pas réparties artificiellement entre appels et formulaires.
          </p>
          <Table className="mt-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Origine</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Dossiers</TableHead>
                <TableHead className="text-right">Interv.</TableHead>
                <TableHead className="text-right">CA net</TableHead>
                <TableHead className="text-right">Encaissé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => {
                const Icon = channelIcons[channel.id];
                return (
                  <TableRow key={channel.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 text-primary" />
                        {channel.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(channel.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(channel.transformedLeads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(channel.interventions)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{euro.format(channel.netRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euro.format(channel.collectedRevenue)}</TableCell>
                  </TableRow>
                );
              })}
              {!channels.length && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucun lead Google sur la période.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border bg-muted/20 p-5 xl:border-l xl:border-t-0">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Fiabilité financière</h3>
          </div>
          <div className="mt-4 space-y-3 text-xs">
            <ReconciliationLine label="Par dossier Glass" value={financialAttribution.invoicesByCase} detail="lien exact" />
            <ReconciliationLine label="Par identité client" value={financialAttribution.invoicesByContact} detail="téléphone ou e-mail" />
            <ReconciliationLine label="Dossiers avec facture" value={financialAttribution.leadsWithInvoice} detail={`${invoiceCoverage} des transformés`} />
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
            Le ROAS correspond au CA net après avoirs divisé par les dépenses Google Ads. La marge après pub reste indicative : elle ne devient complète que lorsque chaque facture contient sa marge estimée.
          </p>
        </div>
      </div>
    </Card>
  );
}

function TransformedCasesSection({ cases }: { cases: MarketingTransformedCaseRow[] }) {
  const withoutInvoice = cases.filter((item) => item.invoices.length === 0).length;

  return (
    <Card className="marketing-card overflow-hidden rounded-xl">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">Dossiers transformés et facturation</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Toutes les transformations Google de la période restent visibles, y compris celles qui attendent encore leur facture.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">{integer.format(cases.length)} dossier{cases.length > 1 ? 's' : ''}</Badge>
          {withoutInvoice > 0 && (
            <Badge className="rounded-full border-warning/30 bg-warning/10 text-warning-foreground">
              {integer.format(withoutInvoice)} sans facture
            </Badge>
          )}
        </div>
      </div>

      {cases.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[190px]">Client</TableHead>
                <TableHead className="min-w-[150px]">Dossier Glass</TableHead>
                <TableHead className="min-w-[155px]">Origine</TableHead>
                <TableHead className="min-w-[210px]">Campagne</TableHead>
                <TableHead className="min-w-[210px]">Facture</TableHead>
                <TableHead className="text-right">Facturé</TableHead>
                <TableHead className="text-right">Avoirs</TableHead>
                <TableHead className="text-right">CA net</TableHead>
                <TableHead className="text-right">Encaissé</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((item) => (
                <TableRow key={item.id} className={item.invoices.length === 0 ? 'bg-warning/5' : undefined}>
                  <TableCell>
                    <p className="font-medium">{item.customerName}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Lead du {new Date(item.arrivedAt).toLocaleDateString('fr-FR')}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{item.caseNumber}</p>
                    {item.glassLabel && <p className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">{item.glassLabel}</p>}
                  </TableCell>
                  <TableCell><LeadChannelBadge item={item} /></TableCell>
                  <TableCell>
                    <p className="max-w-[240px] truncate text-xs" title={item.campaignName}>{item.campaignName}</p>
                  </TableCell>
                  <TableCell>
                    {item.invoices.length ? (
                      <div className="space-y-1.5">
                        {item.invoices.map((invoice) => (
                          <div key={invoice.id}>
                            <p className="text-xs font-medium">{invoice.number}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {euro.format(invoice.amount)} · {invoiceStatusLabel(invoice.status)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Badge className="border-warning/30 bg-warning/10 text-warning-foreground">Facture manquante</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.invoices.length ? euro.format(item.invoicedRevenue) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.creditedRevenue > 0 ? `− ${euro.format(item.creditedRevenue)}` : '—'}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{item.invoices.length ? euro.format(item.netRevenue) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.invoices.length ? euro.format(item.collectedRevenue) : '—'}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="icon" className="rounded-full">
                      <Link to={`/interventions/${item.leadId}`} aria-label={`Ouvrir le dossier de ${item.customerName}`}>
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="p-10 text-center text-sm text-muted-foreground">Aucun dossier Google transformé sur cette période.</div>
      )}
    </Card>
  );
}

function LeadChannelBadge({ item }: { item: MarketingTransformedCaseRow }) {
  const Icon = item.channel === 'telephone' ? PhoneCall : item.channel === 'webhook' ? Webhook : Globe2;
  return (
    <Badge variant="secondary" className="gap-1.5 whitespace-nowrap rounded-full">
      <Icon className="h-3.5 w-3.5" />
      {item.channelLabel}
    </Badge>
  );
}

function invoiceStatusLabel(status: string): string {
  switch (status) {
    case 'paid': return 'Payée';
    case 'partial': return 'Partiellement payée';
    case 'sent': return 'Envoyée';
    case 'overdue': return 'En retard';
    case 'cancelled': return 'Annulée';
    case 'draft': return 'Brouillon';
    default: return status || 'Statut inconnu';
  }
}

function ProfitMetric({ icon: Icon, label, value, detail, tone = 'default' }: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${
        tone === 'danger' ? 'text-destructive' : tone === 'success' ? 'text-success' : ''
      }`}>{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReconciliationLine({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
      </div>
      <span className="text-base font-semibold tabular-nums">{integer.format(value)}</span>
    </div>
  );
}

function AttributionCard({ data }: { data: MarketingDashboardData }) {
  const total = data.totals.leads;
  const rows = [
    { label: 'Campagne identifiée', value: data.attribution.campaignExact, color: 'bg-success' },
    { label: 'Clic capturé, à résoudre', value: data.attribution.clickCaptured, color: 'bg-upcoming' },
    { label: 'Rapprochement par UTM', value: data.attribution.utm, color: 'bg-warning' },
    { label: 'Campagne inconnue', value: data.attribution.unresolved, color: 'bg-destructive' },
  ];
  return (
    <Card className="marketing-card rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Qualité d'attribution</h2>
          <p className="mt-1 text-xs text-muted-foreground">Fiabilité du rattachement des leads aux campagnes</p>
        </div>
        <Target className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span>{row.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {integer.format(row.value)} · {ratio(row.value, total)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`animate-marketing-bar h-full rounded-full ${row.color}`} style={{ width: total ? `${row.value / total * 100}%` : '0%' }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
        Un identifiant de clic reçu ne devient une attribution exacte qu'après résolution de sa campagne.
        Les UTM restent une estimation par nom.
      </p>
    </Card>
  );
}

function MediaBuyingSignals({ data }: { data: MarketingDashboardData }) {
  const { totals, campaigns, attribution } = data;
  const minimumSpend = Math.max(20, totals.spend * 0.08);
  const accountCpl = totals.leads ? totals.spend / totals.leads : 0;
  const signals: Array<{ title: string; detail: string; tone: 'warning' | 'info' | 'success' }> = [];

  if (totals.marginKnownInvoices > 0) {
    const resultAfterAds = marginAfterAdvertising(totals);
    signals.push({
      title: resultAfterAds >= 0 ? 'L’acquisition couvre la marge connue' : 'La marge connue ne couvre pas la publicité',
      detail: `${euro.format(resultAfterAds)} après déduction des avoirs et de ${euro.format(totals.spend)} de Google Ads.`,
      tone: resultAfterAds >= 0 ? 'success' : 'warning',
    });
  }

  for (const campaign of campaigns.filter((item) => item.spend >= minimumSpend && item.leads === 0).slice(0, 2)) {
    signals.push({
      title: `${campaign.name} dépense sans lead CRM`,
      detail: `${euro.format(campaign.spend)} dépensés et ${integer.format(campaign.clicks)} clics sur la période.`,
      tone: 'warning',
    });
  }
  for (const campaign of campaigns.filter((item) => (
    item.leads >= 2 && accountCpl > 0 && item.spend / item.leads > accountCpl * 1.4
  )).slice(0, 2)) {
    signals.push({
      title: `CPL élevé sur ${campaign.name}`,
      detail: `${cost(campaign.spend, campaign.leads)} contre ${euro.format(accountCpl)} en moyenne.`,
      tone: 'warning',
    });
  }
  const withoutAppointment = campaigns.find((item) => item.leads >= 3 && item.appointments === 0);
  if (withoutAppointment) {
    signals.push({
      title: `Les leads de ${withoutAppointment.name} ne prennent pas rendez-vous`,
      detail: `${withoutAppointment.leads} leads, dont ${withoutAppointment.qualifiedLeads} qualifiés, sans rendez-vous rattaché.`,
      tone: 'info',
    });
  }
  if (totals.leads > 0 && attribution.campaignExact / totals.leads < 0.8) {
    signals.push({
      title: 'Attribution campagne à renforcer',
      detail: `${ratio(attribution.campaignExact, totals.leads)} des leads Google sont rattachés à une campagne exacte.`,
      tone: 'info',
    });
  }
  const best = campaigns
    .filter((item) => item.spend > 0 && item.netRevenue > 0)
    .sort((a, b) => b.netRevenue / b.spend - a.netRevenue / a.spend)[0];
  if (best) {
    signals.push({
      title: `${best.name} a le meilleur ROAS CRM`,
      detail: `${multiple(best.netRevenue, best.spend)} de ROAS sur ${euro.format(best.netRevenue)} de CA net rapproché.`,
      tone: 'success',
    });
  }

  return (
    <Card className="marketing-card rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Lecture media buying</h2>
          <p className="mt-1 text-xs text-muted-foreground">Signaux calculés à partir de Google Ads et du CRM</p>
        </div>
        <Gauge className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-5 space-y-3">
        {signals.length ? signals.slice(0, 5).map((signal) => (
          <div
            key={`${signal.title}-${signal.detail}`}
            className={`marketing-signal rounded-lg border p-3 ${
              signal.tone === 'warning' ? 'border-warning/30 bg-warning/5'
                : signal.tone === 'success' ? 'border-success/30 bg-success/5'
                  : 'border-border bg-muted/30'
            }`}
          >
            <div className="flex items-start gap-2">
              {signal.tone === 'warning'
                ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                : <TrendingUp className={`mt-0.5 h-4 w-4 shrink-0 ${signal.tone === 'success' ? 'text-success' : 'text-primary'}`} />}
              <div>
                <p className="text-xs font-medium">{signal.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{signal.detail}</p>
              </div>
            </div>
          </div>
        )) : (
          <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">
            Pas encore assez de volume pour produire des signaux fiables.
          </div>
        )}
      </div>
    </Card>
  );
}

type KeywordSummary = {
  id: string;
  keyword: string;
  matchType: string | null;
  campaignName: string;
  adGroupName: string;
  searchTerms: Set<string>;
  devices: Set<string>;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
};

function aggregateKeywords(terms: MarketingSearchTermRow[]): KeywordSummary[] {
  const keywords = new Map<string, KeywordSummary>();
  for (const term of terms) {
    const keyword = term.keywordText || 'Automatique / non communiqué';
    const id = `${term.campaignId}|${term.adGroupId}|${keyword}|${term.keywordMatchType ?? ''}`;
    if (!keywords.has(id)) {
      keywords.set(id, {
        id, keyword, matchType: term.keywordMatchType,
        campaignName: term.campaignName, adGroupName: term.adGroupName,
        searchTerms: new Set(), devices: new Set(),
        impressions: 0, clicks: 0, spend: 0, conversions: 0,
      });
    }
    const row = keywords.get(id)!;
    row.searchTerms.add(term.searchTerm);
    term.devices.forEach((device) => row.devices.add(device));
    row.impressions += term.impressions;
    row.clicks += term.clicks;
    row.spend += term.spend;
    row.conversions += term.conversions;
  }
  return [...keywords.values()].sort((a, b) => b.spend - a.spend || b.clicks - a.clicks);
}

function matchTypeLabel(value: string | null): string {
  switch (value) {
    case 'EXACT': return 'Exact';
    case 'PHRASE': return 'Expression';
    case 'BROAD': return 'Large';
    default: return value || '—';
  }
}

function deviceLabel(value: string): string {
  switch (value) {
    case 'MOBILE': return 'Mobile';
    case 'DESKTOP': return 'Ordinateur';
    case 'TABLET': return 'Tablette';
    case 'CONNECTED_TV': return 'TV';
    default: return value;
  }
}

type AnalysisView = 'all' | 'attention' | 'converting' | 'opportunities';
type SearchSort = 'priority' | 'spend' | 'conversions' | 'cpa' | 'ctr';
type SearchPerformance = { impressions: number; clicks: number; spend: number; conversions: number };

function performanceSignal(row: SearchPerformance, averageCpa: number, alertSpend: number) {
  if (row.conversions > 0) {
    const cpa = row.spend / row.conversions;
    if (averageCpa > 0 && cpa <= averageCpa) {
      return { label: 'Rentable', className: 'border-success/30 bg-success/10 text-success' };
    }
    return { label: 'Convertit', className: 'border-primary/30 bg-primary/10 text-primary' };
  }
  if (row.spend >= alertSpend) {
    return { label: 'À exclure ?', className: 'border-warning/40 bg-warning/10 text-warning-foreground' };
  }
  if (row.clicks >= 3) {
    return { label: 'À surveiller', className: 'border-warning/30 bg-warning/5 text-warning-foreground' };
  }
  return { label: 'Exploration', className: 'border-border bg-muted/40 text-muted-foreground' };
}

function matchesAnalysis(
  row: SearchPerformance,
  matchType: string | null,
  view: AnalysisView,
  alertSpend: number,
): boolean {
  if (view === 'attention') return row.conversions === 0 && (row.spend >= alertSpend || row.clicks >= 3);
  if (view === 'converting') return row.conversions > 0;
  if (view === 'opportunities') return row.conversions > 0 && matchType !== 'EXACT';
  return true;
}

function compareSearchPerformance(
  a: SearchPerformance,
  b: SearchPerformance,
  sort: SearchSort,
  alertSpend: number,
): number {
  if (sort === 'conversions') return b.conversions - a.conversions || b.spend - a.spend;
  if (sort === 'cpa') {
    const aCpa = a.conversions > 0 ? a.spend / a.conversions : Number.POSITIVE_INFINITY;
    const bCpa = b.conversions > 0 ? b.spend / b.conversions : Number.POSITIVE_INFINITY;
    return aCpa - bCpa || b.conversions - a.conversions;
  }
  if (sort === 'ctr') {
    const aCtr = a.impressions > 0 ? a.clicks / a.impressions : 0;
    const bCtr = b.impressions > 0 ? b.clicks / b.impressions : 0;
    return bCtr - aCtr || b.clicks - a.clicks;
  }
  if (sort === 'priority') {
    const aNeedsAttention = a.conversions === 0 && (a.spend >= alertSpend || a.clicks >= 3) ? 1 : 0;
    const bNeedsAttention = b.conversions === 0 && (b.spend >= alertSpend || b.clicks >= 3) ? 1 : 0;
    return bNeedsAttention - aNeedsAttention || b.spend - a.spend || b.conversions - a.conversions;
  }
  return b.spend - a.spend || b.clicks - a.clicks;
}

function SearchTermsSection({ terms, available }: {
  terms: MarketingSearchTermRow[];
  available: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [analysisView, setAnalysisView] = useState<AnalysisView>('attention');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [sort, setSort] = useState<SearchSort>('priority');

  if (!available) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Mots-clés prêts côté application</AlertTitle>
        <AlertDescription>
          Appliquez la migration <code>20260904090000_google_ads_search_terms.sql</code> dans un nouvel onglet Supabase,
          puis relancez la synchronisation Google Ads.
        </AlertDescription>
      </Alert>
    );
  }

  const totalSpend = terms.reduce((sum, term) => sum + term.spend, 0);
  const totalClicks = terms.reduce((sum, term) => sum + term.clicks, 0);
  const totalConversions = terms.reduce((sum, term) => sum + term.conversions, 0);
  const averageCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const alertSpend = Math.max(10, averageCpa > 0 ? averageCpa * 0.5 : 10);
  const noConversionSpend = terms
    .filter((term) => term.conversions === 0)
    .reduce((sum, term) => sum + term.spend, 0);
  const attentionTerms = terms
    .filter((term) => matchesAnalysis(term, term.keywordMatchType, 'attention', alertSpend))
    .sort((a, b) => b.spend - a.spend);
  const opportunityTerms = terms
    .filter((term) => matchesAnalysis(term, term.keywordMatchType, 'opportunities', alertSpend))
    .sort((a, b) => b.conversions - a.conversions || a.spend / a.conversions - b.spend / b.conversions);
  const campaigns = [...new Set(terms.map((term) => term.campaignName))].sort((a, b) => a.localeCompare(b, 'fr'));
  const devices = [...new Set(terms.flatMap((term) => term.devices))].sort();
  const needle = normalized(filter);
  const termRows = terms
    .filter((term) => normalized([
      term.searchTerm, term.keywordText, term.campaignName, term.adGroupName,
    ].filter(Boolean).join(' ')).includes(needle))
    .filter((term) => campaignFilter === 'all' || term.campaignName === campaignFilter)
    .filter((term) => deviceFilter === 'all' || term.devices.includes(deviceFilter))
    .filter((term) => matchesAnalysis(term, term.keywordMatchType, analysisView, alertSpend))
    .sort((a, b) => compareSearchPerformance(a, b, sort, alertSpend));
  const keywordRows = aggregateKeywords(terms)
    .filter((keyword) => normalized([
      keyword.keyword, keyword.campaignName, keyword.adGroupName,
    ].join(' ')).includes(needle))
    .filter((keyword) => campaignFilter === 'all' || keyword.campaignName === campaignFilter)
    .filter((keyword) => deviceFilter === 'all' || keyword.devices.has(deviceFilter))
    .filter((keyword) => matchesAnalysis(keyword, keyword.matchType, analysisView, alertSpend))
    .sort((a, b) => compareSearchPerformance(a, b, sort, alertSpend));

  return (
    <Card className="marketing-card overflow-hidden rounded-xl">
      <div className="border-b border-border p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Analyse des recherches Google</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              La vue par défaut remonte le budget qui mérite une décision, puis sépare requêtes saisies et mots-clés déclencheurs.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full shrink-0 rounded-full lg:w-auto"
            onClick={() => exportSearchTerms(termRows)}
            disabled={!termRows.length}
          >
            <Download className="mr-2 h-4 w-4" />
            Exporter la vue
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Budget analysé</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{euro.format(totalSpend)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{integer.format(totalClicks)} clics · {integer.format(terms.length)} requêtes</p>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sans conversion</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{euro.format(noConversionSpend)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{ratio(noConversionSpend, totalSpend)} du budget · {attentionTerms.length} priorités</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Taux de conversion</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{ratio(totalConversions, totalClicks)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{decimal.format(totalConversions)} conversions Google</p>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CPA moyen</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{cost(totalSpend, totalConversions)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{opportunityTerms.length} requêtes à tester en exact</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-warning" />
              <p className="text-xs font-semibold">À couper ou exclure en priorité</p>
            </div>
            <div className="mt-3 space-y-2">
              {attentionTerms.slice(0, 3).map((term) => (
                <div key={term.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{term.searchTerm}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{term.campaignName} · {term.clicks} clics</p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{euro.format(term.spend)}</span>
                </div>
              ))}
              {!attentionTerms.length && <p className="text-xs text-muted-foreground">Aucune dépense préoccupante sur la période.</p>}
            </div>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-success" />
              <p className="text-xs font-semibold">À développer en mot-clé exact</p>
            </div>
            <div className="mt-3 space-y-2">
              {opportunityTerms.slice(0, 3).map((term) => (
                <div key={term.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{term.searchTerm}</p>
                    <p className="truncate text-[10px] text-muted-foreground">Déclenché par {term.keywordText || 'ciblage automatique'}</p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{decimal.format(term.conversions)} conv.</span>
                </div>
              ))}
              {!opportunityTerms.length && <p className="text-xs text-muted-foreground">Aucune opportunité suffisamment confirmée.</p>}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_220px_170px_170px]">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Rechercher une requête, un mot-clé…"
          />
          <Select value={analysisView} onValueChange={(value) => setAnalysisView(value as AnalysisView)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="attention">À surveiller</SelectItem>
              <SelectItem value="converting">Convertisseurs</SelectItem>
              <SelectItem value="opportunities">Opportunités exactes</SelectItem>
              <SelectItem value="all">Toutes les données</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger><SelectValue placeholder="Toutes les campagnes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les campagnes</SelectItem>
              {campaigns.map((campaign) => <SelectItem key={campaign} value={campaign}>{campaign}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger><SelectValue placeholder="Tous les appareils" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les appareils</SelectItem>
              {devices.map((device) => <SelectItem key={device} value={device}>{deviceLabel(device)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as SearchSort)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priorité d'action</SelectItem>
              <SelectItem value="spend">Dépenses</SelectItem>
              <SelectItem value="conversions">Conversions</SelectItem>
              <SelectItem value="cpa">Meilleur CPA</SelectItem>
              <SelectItem value="ctr">Meilleur CTR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!terms.length ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Aucun terme communiqué par Google sur cette période. Google masque aussi les requêtes à très faible volume.
        </div>
      ) : (
        <Tabs defaultValue="terms" className="w-full">
          <div className="border-b border-border px-5 pt-4">
            <TabsList>
              <TabsTrigger value="terms">Requêtes saisies ({termRows.length})</TabsTrigger>
              <TabsTrigger value="keywords">Mots-clés déclencheurs ({keywordRows.length})</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="terms" className="m-0 animate-marketing-tab">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[260px]">Recherche et décision</TableHead>
                    <TableHead className="min-w-[210px]">Déclenchement</TableHead>
                    <TableHead className="min-w-[220px]">Contexte</TableHead>
                    <TableHead className="min-w-[130px] text-right">Trafic</TableHead>
                    <TableHead className="min-w-[130px] text-right">Dépense</TableHead>
                    <TableHead className="min-w-[140px] text-right">Résultat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {termRows.slice(0, 100).map((term) => {
                    const signal = performanceSignal(term, averageCpa, alertSpend);
                    return (
                      <TableRow key={term.id} className={`marketing-table-row ${term.conversions === 0 && term.spend >= alertSpend ? 'bg-warning/5' : ''}`}>
                        <TableCell>
                          <p className="font-medium">{term.searchTerm}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <Badge variant="outline" className={`rounded-full text-[10px] ${signal.className}`}>{signal.label}</Badge>
                            {term.searchTermMatchType && (
                              <Badge variant="secondary" className="rounded-full text-[10px]">Recherche {matchTypeLabel(term.searchTermMatchType)}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs">{term.keywordText || 'Automatique / non communiqué'}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">Correspondance {matchTypeLabel(term.keywordMatchType).toLowerCase()}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium">{term.campaignName}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{term.adGroupName}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{term.devices.map(deviceLabel).join(', ')}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium tabular-nums">{integer.format(term.clicks)} clics</p>
                          <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{integer.format(term.impressions)} impr. · {ratio(term.clicks, term.impressions)} CTR</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium tabular-nums">{euro.format(term.spend)}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{cost(term.spend, term.clicks)} / clic</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium tabular-nums">{decimal.format(term.conversions)} conv.</p>
                          <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                            {ratio(term.conversions, term.clicks)} · {cost(term.spend, term.conversions)} / conv.
                          </p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!termRows.length && (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Aucune requête pour ces filtres.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="keywords" className="m-0 animate-marketing-tab">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[250px]">Mot-clé et décision</TableHead>
                    <TableHead className="min-w-[230px]">Contexte</TableHead>
                    <TableHead className="min-w-[130px] text-right">Couverture</TableHead>
                    <TableHead className="min-w-[130px] text-right">Trafic</TableHead>
                    <TableHead className="min-w-[130px] text-right">Dépense</TableHead>
                    <TableHead className="min-w-[140px] text-right">Résultat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keywordRows.slice(0, 100).map((keyword) => {
                    const signal = performanceSignal(keyword, averageCpa, alertSpend);
                    return (
                      <TableRow key={keyword.id} className={`marketing-table-row ${keyword.conversions === 0 && keyword.spend >= alertSpend ? 'bg-warning/5' : ''}`}>
                        <TableCell>
                          <p className="font-medium">{keyword.keyword}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <Badge variant="outline" className={`rounded-full text-[10px] ${signal.className}`}>{signal.label}</Badge>
                            <Badge variant="secondary" className="rounded-full text-[10px]">{matchTypeLabel(keyword.matchType)}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium">{keyword.campaignName}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{keyword.adGroupName}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{[...keyword.devices].map(deviceLabel).join(', ')}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium tabular-nums">{integer.format(keyword.searchTerms.size)} requêtes</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">couverture observée</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium tabular-nums">{integer.format(keyword.clicks)} clics</p>
                          <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{integer.format(keyword.impressions)} impr. · {ratio(keyword.clicks, keyword.impressions)} CTR</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium tabular-nums">{euro.format(keyword.spend)}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{cost(keyword.spend, keyword.clicks)} / clic</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium tabular-nums">{decimal.format(keyword.conversions)} conv.</p>
                          <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                            {ratio(keyword.conversions, keyword.clicks)} · {cost(keyword.spend, keyword.conversions)} / conv.
                          </p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!keywordRows.length && (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Aucun mot-clé pour ces filtres.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
            Les recommandations sont des aides à la décision : aucune exclusion ni modification Google Ads n'est appliquée automatiquement. Maximum 100 lignes visibles ; l'export reprend toute la vue filtrée.
          </div>
        </Tabs>
      )}
    </Card>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Skeleton className="h-[360px] rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
    </div>
  );
}
