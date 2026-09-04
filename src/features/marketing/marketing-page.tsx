import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle, CalendarCheck2, CircleDollarSign, MousePointerClick,
  Download, Gauge, RefreshCw, Settings2, Target, TrendingUp,
  TriangleAlert, UserCheck, UserPlus, Wrench,
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
  type MarketingSearchTermRow,
} from './marketing-service';

const chartConfig = {
  clicks: { label: 'Clics', color: 'hsl(var(--chart-2))' },
  leads: { label: 'Leads', color: 'hsl(var(--chart-1))' },
  interventions: { label: 'Interventions', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
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
    'Rendez-vous', 'Interventions', 'Coût par intervention',
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
    campaign.interventions,
    campaign.interventions > 0 ? (campaign.spend / campaign.interventions).toFixed(2).replace('.', ',') : '',
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
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-[132px] rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="30">30 jours</SelectItem>
                <SelectItem value="90">90 jours</SelectItem>
              </SelectContent>
            </Select>
            {data && data.campaigns.length > 0 && (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => exportCampaigns(data.campaigns, days)}
              >
                <Download className="mr-2 h-4 w-4" />
                Exporter
              </Button>
            )}
            {profile?.role === 'admin' && (
              <Button variant="outline" className="rounded-full" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
                Actualiser Google
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
        <div className="space-y-5 p-4 sm:p-6">
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
            <>
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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
                  icon={Wrench}
                  label="Interventions"
                  value={integer.format(totals.interventions)}
                  detail={`${cost(totals.spend, totals.interventions)} / intervention`}
                  trend={previous ? variation(totals.interventions, previous.interventions) : undefined}
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
                <Card className="rounded-xl p-5">
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
                      <Area dataKey="clicks" type="monotone" fill="url(#fillClicks)" stroke="var(--color-clicks)" strokeWidth={2} />
                      <Area dataKey="leads" type="monotone" fill="transparent" stroke="var(--color-leads)" strokeWidth={2} />
                      <Area dataKey="interventions" type="monotone" fill="transparent" stroke="var(--color-interventions)" strokeWidth={2} />
                    </AreaChart>
                  </ChartContainer>
                </Card>

                <Card className="rounded-xl p-5">
                  <h2 className="text-sm font-semibold">Entonnoir de conversion</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Chaque étape est issue des données réelles du CRM</p>
                  <div className="mt-6 space-y-5">
                    <FunnelStep label="Clics" value={totals.clicks} reference={totals.clicks} color="bg-upcoming" />
                    <FunnelStep label="Leads reçus" value={totals.leads} reference={totals.clicks} color="bg-primary" />
                    <FunnelStep label="Leads qualifiés" value={totals.qualifiedLeads} reference={totals.clicks} color="bg-primary" />
                    <FunnelStep label="Rendez-vous" value={totals.appointments} reference={totals.clicks} color="bg-due" />
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

              <Card className="overflow-hidden rounded-xl">
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
            </>
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
    <Card className="rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
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
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
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
            <TableHead className="text-right">Interv.</TableHead>
            <TableHead className="text-right">Coût / interv.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => {
            const status = campaignStatus(campaign.status);
            return (
              <TableRow
                key={campaign.id}
                className={campaign.spend > 0 && campaign.leads === 0 ? 'bg-warning/5' : undefined}
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
                <TableCell className="text-right tabular-nums font-medium">{integer.format(campaign.interventions)}</TableCell>
                <TableCell className="text-right tabular-nums">{cost(campaign.spend, campaign.interventions)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
    <Card className="rounded-xl p-5">
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
              <div className={`h-full rounded-full ${row.color}`} style={{ width: total ? `${row.value / total * 100}%` : '0%' }} />
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
    .filter((item) => item.interventions > 0)
    .sort((a, b) => a.spend / a.interventions - b.spend / b.interventions)[0];
  if (best) {
    signals.push({
      title: `${best.name} transforme le mieux en intervention`,
      detail: `${best.interventions} intervention${best.interventions > 1 ? 's' : ''} à ${cost(best.spend, best.interventions)} chacune.`,
      tone: 'success',
    });
  }

  return (
    <Card className="rounded-xl p-5">
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
            className={`rounded-lg border p-3 ${
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
        searchTerms: new Set(), impressions: 0, clicks: 0, spend: 0, conversions: 0,
      });
    }
    const row = keywords.get(id)!;
    row.searchTerms.add(term.searchTerm);
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

function targetingLabel(value: string | null): string {
  switch (value) {
    case 'ADDED': return 'Ajouté';
    case 'EXCLUDED': return 'Exclu';
    case 'ADDED_EXCLUDED': return 'Ajouté et exclu';
    case 'NONE': return 'Non ciblé';
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

function SearchTermsSection({ terms, available }: {
  terms: MarketingSearchTermRow[];
  available: boolean;
}) {
  const [filter, setFilter] = useState('');
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

  const needle = normalized(filter);
  const filteredTerms = terms.filter((term) => normalized([
    term.searchTerm, term.keywordText, term.campaignName, term.adGroupName,
  ].filter(Boolean).join(' ')).includes(needle));
  const keywords = aggregateKeywords(terms).filter((keyword) => normalized([
    keyword.keyword, keyword.campaignName, keyword.adGroupName,
  ].join(' ')).includes(needle));

  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Mots-clés et termes de recherche</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ce que l'internaute a tapé, le mot-clé déclencheur et leur rentabilité Google Ads.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Rechercher un terme, mot-clé…"
            className="min-w-0 flex-1 sm:w-[260px]"
          />
          <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => exportSearchTerms(filteredTerms)}>
            <Download className="h-4 w-4" />
            <span className="sr-only">Exporter les termes filtrés</span>
          </Button>
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
              <TabsTrigger value="terms">Termes de recherche ({filteredTerms.length})</TabsTrigger>
              <TabsTrigger value="keywords">Mots-clés ({keywords.length})</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="terms" className="m-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[230px]">Terme recherché</TableHead>
                    <TableHead className="min-w-[190px]">Mot-clé déclencheur</TableHead>
                    <TableHead className="min-w-[220px]">Campagne / groupe</TableHead>
                    <TableHead>Appareil</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">Clics</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Coût</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">Coût / conv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTerms.slice(0, 100).map((term) => (
                    <TableRow key={term.id} className={term.spend > 0 && term.conversions === 0 ? 'bg-warning/5' : undefined}>
                      <TableCell>
                        <p className="font-medium">{term.searchTerm}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{targetingLabel(term.targetingStatus)}</p>
                      </TableCell>
                      <TableCell>
                        <p>{term.keywordText || 'Automatique / non communiqué'}</p>
                        <Badge variant="secondary" className="mt-1 rounded-full text-[10px]">
                          {matchTypeLabel(term.keywordMatchType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{term.campaignName}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{term.adGroupName}</p>
                      </TableCell>
                      <TableCell className="text-xs">{term.devices.map(deviceLabel).join(', ')}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer.format(term.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer.format(term.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{ratio(term.clicks, term.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{euro.format(term.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cost(term.spend, term.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer.format(term.conversions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cost(term.spend, term.conversions)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="keywords" className="m-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[230px]">Mot-clé</TableHead>
                    <TableHead className="min-w-[220px]">Campagne / groupe</TableHead>
                    <TableHead className="text-right">Termes</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">Clics</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Coût</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">Coût / conv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keywords.slice(0, 100).map((keyword) => (
                    <TableRow key={keyword.id}>
                      <TableCell>
                        <p className="font-medium">{keyword.keyword}</p>
                        <Badge variant="secondary" className="mt-1 rounded-full text-[10px]">
                          {matchTypeLabel(keyword.matchType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{keyword.campaignName}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{keyword.adGroupName}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{integer.format(keyword.searchTerms.size)}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer.format(keyword.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer.format(keyword.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{ratio(keyword.clicks, keyword.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{euro.format(keyword.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cost(keyword.spend, keyword.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer.format(keyword.conversions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cost(keyword.spend, keyword.conversions)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
            Les lignes orange ont dépensé sans conversion Google sur la période. Maximum 100 lignes affichées par onglet ; l'export campagne reste disponible en haut.
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
