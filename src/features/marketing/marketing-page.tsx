import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle, CalendarCheck2, CircleDollarSign, MousePointerClick,
  RefreshCw, Settings2, TrendingUp, UserPlus, Wrench,
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
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import { syncGoogleAds } from '@/features/integrations/google/google-ads-service';
import { fetchMarketingDashboard, type MarketingCampaignRow } from './marketing-service';

const chartConfig = {
  clicks: { label: 'Clics', color: 'hsl(var(--chart-2))' },
  leads: { label: 'Leads', color: 'hsl(var(--chart-1))' },
  interventions: { label: 'Interventions', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

function ratio(value: number, total: number): string {
  return total > 0 ? percent.format(value / total) : '—';
}

function cost(value: number, count: number): string {
  return count > 0 ? euro.format(value / count) : '—';
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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Kpi icon={CircleDollarSign} label="Dépenses" value={euro.format(totals.spend)} detail={`${integer.format(totals.impressions)} impressions`} />
                <Kpi icon={MousePointerClick} label="Clics" value={integer.format(totals.clicks)} detail={`${cost(totals.spend, totals.clicks)} / clic`} />
                <Kpi icon={UserPlus} label="Leads Google" value={integer.format(totals.leads)} detail={`${cost(totals.spend, totals.leads)} / lead`} />
                <Kpi icon={CalendarCheck2} label="Rendez-vous" value={integer.format(totals.appointments)} detail={`${ratio(totals.appointments, totals.leads)} des leads`} />
                <Kpi icon={Wrench} label="Interventions" value={integer.format(totals.interventions)} detail={`${cost(totals.spend, totals.interventions)} / intervention`} />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
                <Card className="rounded-xl p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Performance dans le temps</h2>
                      <p className="mt-1 text-xs text-muted-foreground">Clics Google et résultats réellement obtenus dans le CRM</p>
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
                    <FunnelStep label="Rendez-vous" value={totals.appointments} reference={totals.clicks} color="bg-due" />
                    <FunnelStep label="Interventions réalisées" value={totals.interventions} reference={totals.clicks} color="bg-done" />
                  </div>
                  <div className="mt-6 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Qualité d'attribution :</span>{' '}
                    {data.exactAttributions} exacte{data.exactAttributions > 1 ? 's' : ''}
                    {data.approximateAttributions > 0 && ` · ${data.approximateAttributions} par UTM`}
                  </div>
                </Card>
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
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, detail }: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
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
            <TableHead>Campagne</TableHead>
            <TableHead className="text-right">Dépenses</TableHead>
            <TableHead className="text-right">Clics</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Rendez-vous</TableHead>
            <TableHead className="text-right">Interventions</TableHead>
            <TableHead className="text-right">Coût / intervention</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => {
            const status = campaignStatus(campaign.status);
            return (
              <TableRow key={campaign.id}>
                <TableCell>
                  <div className="max-w-[300px]">
                    <p className="truncate text-sm font-medium">{campaign.name}</p>
                    <Badge variant="secondary" className={`mt-1 rounded-full text-[10px] ${status.className}`}>{status.label}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{euro.format(campaign.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">{integer.format(campaign.leads)}</TableCell>
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
