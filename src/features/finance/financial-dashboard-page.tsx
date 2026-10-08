import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, CalendarClock,
  CheckCircle2, CircleDollarSign, Download, FileCheck2, Gift, Landmark,
  ListChecks, Loader2, Receipt, RefreshCw, Scale, ShieldCheck, TrendingUp,
  ShoppingCart, TriangleAlert, UsersRound, WalletCards,
} from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Invoice, OnifyCreditNote } from '@/types';
import { AccountingConsolidatedSection } from './accounting-consolidated-section';
import { fetchFinancialDashboardData, type FinancialDashboardData } from './financial-dashboard-service';

type FinancialPeriod = '30d' | '90d' | 'year' | 'all';

interface DateRange {
  start: Date | null;
  end: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
}

interface FinancialTotals {
  amountHt: number;
  vat: number;
  billed: number;
  credits: number;
  creditsHt: number;
  draftCredits: number;
  netRevenue: number;
  netRevenueHt: number;
  collected: number;
  outstanding: number;
  margin: number;
  supplierPurchasesHt: number;
  supplierPurchasesTtc: number;
  supplierPurchaseDocuments: number;
  gifts: number;
  invoiceCount: number;
  overdueCount: number;
  overdueAmount: number;
  acceptedQuotes: number;
  quoteCount: number;
  acceptedQuoteAmount: number;
  insurance: number;
  franchise: number;
}

interface TimelinePoint {
  key: string;
  label: string;
  facture: number;
  encaisse: number;
  avoirs: number;
}

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat('fr-FR');

const chartConfig = {
  facture: { label: 'Facturé', color: 'hsl(var(--primary))' },
  encaisse: { label: 'Encaissé', color: 'hsl(var(--done))' },
  avoirs: { label: 'Avoirs', color: 'hsl(var(--urgent))' },
} satisfies ChartConfig;

const periodLabels: Record<FinancialPeriod, string> = {
  '30d': '30 derniers jours',
  '90d': '90 derniers jours',
  year: 'Depuis janvier',
  all: 'Toutes les données',
};

export function FinancialDashboardPage() {
  const [period, setPeriod] = useState<FinancialPeriod>('year');
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['financial-dashboard'],
    queryFn: fetchFinancialDashboardData,
  });

  const view = useMemo(() => data ? buildView(data, period) : null, [data, period]);

  return (
    <>
      <PageHeader
        title="Pilotage financier"
        description="Chiffre d'affaires, encaissements, marge et risque client"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="hidden rounded-full sm:inline-flex" onClick={() => view && exportFinancialCsv(view)} disabled={!view}>
              <Download className="mr-2 h-4 w-4" />
              Exporter
            </Button>
            <Select value={period} onValueChange={(value) => setPeriod(value as FinancialPeriod)}>
              <SelectTrigger className="h-9 w-[175px] rounded-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(periodLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => void refetch()} disabled={isFetching} aria-label="Actualiser">
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="gutter-x mx-auto max-w-[1500px] space-y-5 py-4 sm:py-6">
          {isLoading && <LoadingState />}
          {isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Le tableau financier ne peut pas être chargé</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>{error instanceof Error ? error.message : 'Erreur inconnue'}</span>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => void refetch()}>Réessayer</Button>
              </AlertDescription>
            </Alert>
          )}
          {view && <DashboardContent view={view} />}
          <AccountingConsolidatedSection />
        </div>
      </div>
    </>
  );
}

function DashboardContent({ view }: { view: ReturnType<typeof buildView> }) {
  const {
    totals, previous, timeline, overdue, aging, collectionRate, quoteRate,
    estimatedDso, forecast, statuses, topCustomers, paymentMethods,
    insurerExposure, quality,
  } = view;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Receipt} label="CA net" value={euro.format(totals.netRevenue)} detail={`${euro.format(totals.billed)} facturé · ${euro.format(totals.credits)} d'avoirs`} trend={variation(totals.netRevenue, previous?.netRevenue)} />
        <MetricCard icon={Banknote} label="Encaissé" value={euro.format(totals.collected)} detail={`${formatPercent(collectionRate)} du montant facturé`} trend={variation(totals.collected, previous?.collected)} tone="success" />
        <MetricCard icon={CalendarClock} label="À encaisser" value={euro.format(totals.outstanding)} detail={`${integer.format(totals.overdueCount)} facture${totals.overdueCount > 1 ? 's' : ''} en retard`} tone={totals.overdueAmount > 0 ? 'danger' : 'neutral'} />
        <MetricCard icon={TrendingUp} label="Marge brute HT" value={euro.format(totals.margin)} detail={`${formatPercent(ratio(totals.margin, totals.netRevenueHt))} du CA net HT`} trend={variation(totals.margin, previous?.margin)} tone={totals.margin >= 0 ? 'success' : 'danger'} />
        <MetricCard icon={Scale} label="Panier moyen" value={euro.format(safeDivide(totals.netRevenue, totals.invoiceCount))} detail={`${integer.format(totals.invoiceCount)} facture${totals.invoiceCount > 1 ? 's' : ''}`} trend={variation(safeDivide(totals.netRevenue, totals.invoiceCount), previous ? safeDivide(previous.netRevenue, previous.invoiceCount) : undefined)} />
        <MetricCard icon={CircleDollarSign} label="TVA collectée" value={euro.format(totals.vat)} detail={`${euro.format(totals.amountHt)} de chiffre d'affaires HT`} />
        <MetricCard icon={ShoppingCart} label="Achats fournisseurs" value={euro.format(totals.supplierPurchasesHt)} detail={`${integer.format(totals.supplierPurchaseDocuments)} document${totals.supplierPurchaseDocuments > 1 ? 's' : ''} · montant HT`} />
        <MetricCard icon={WalletCards} label="Délai d'encaissement estimé" value={`${integer.format(Math.round(estimatedDso))} jours`} detail="Estimation basée sur le CA et le reste dû de la période" tone={estimatedDso > 45 ? 'danger' : 'neutral'} />
        <MetricCard icon={Gift} label="Coût cadeaux" value={euro.format(totals.gifts)} detail={`${totals.draftCredits ? `${integer.format(totals.draftCredits)} avoir(s) en brouillon exclus` : 'Avoirs brouillons exclus'}`} />
      </div>

      {totals.overdueAmount > 0 && (
        <Alert className="border-urgent/30 bg-urgent-soft/40">
          <TriangleAlert className="h-4 w-4 text-urgent" />
          <AlertTitle>Encaissements à sécuriser</AlertTitle>
          <AlertDescription>
            {euro.format(totals.overdueAmount)} sont arrivés à échéance. Les factures les plus anciennes apparaissent plus bas pour prioriser les relances.
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-primary/20 bg-primary/5">
        <Scale className="h-4 w-4 text-primary" />
        <AlertTitle>Marge brute calculée à partir des données réelles</AlertTitle>
        <AlertDescription>
          CA net HT moins achats fournisseurs HT. Ce montant n’est pas le bénéfice net : salaires, loyer, publicité, frais bancaires, impôts et autres charges restent à déduire.
        </AlertDescription>
      </Alert>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="rounded-xl border border-border p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Activité financière</h2>
              <p className="mt-1 text-xs text-muted-foreground">Factures, encaissements rattachés et avoirs sur la période</p>
            </div>
            <CircleDollarSign className="h-4 w-4 text-primary" />
          </div>
          <ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto">
            <ComposedChart data={timeline} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compactEuro} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="facture" fill="var(--color-facture)" radius={[4, 4, 0, 0]} animationDuration={700} />
              <Bar dataKey="avoirs" fill="var(--color-avoirs)" radius={[4, 4, 0, 0]} animationDuration={800} />
              <Line dataKey="encaisse" type="monotone" stroke="var(--color-encaisse)" strokeWidth={2.5} dot={false} animationDuration={900} />
            </ComposedChart>
          </ChartContainer>
          <p className="mt-3 text-[11px] text-muted-foreground">Pour les factures Onify sans date de règlement détaillée, l'encaissement est rattaché à la date de facture.</p>
        </Card>

        <Card className="rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold">Qualité des encaissements</h2>
          <p className="mt-1 text-xs text-muted-foreground">Répartition du reste dû selon son ancienneté</p>
          <div className="mt-5 space-y-5">
            <ProgressRow label="Pas encore échu" value={aging.upcoming} total={totals.outstanding} color="bg-upcoming" />
            <ProgressRow label="Retard 1 à 30 jours" value={aging.days30} total={totals.outstanding} color="bg-due" />
            <ProgressRow label="Retard 31 à 60 jours" value={aging.days60} total={totals.outstanding} color="bg-urgent" />
            <ProgressRow label="Retard de plus de 60 jours" value={aging.over60} total={totals.outstanding} color="bg-destructive" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5">
            <MiniStat label="Couverture assurance" value={euro.format(totals.insurance)} />
            <MiniStat label="Franchises clients" value={euro.format(totals.franchise)} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <FinancialStatementCard totals={totals} />
        <ForecastCard forecast={forecast} total={totals.outstanding} />
        <InvoiceStatusCard statuses={statuses} total={totals.billed} />
        <DataQualityCard quality={quality} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <OverdueTable rows={overdue} />
        <Card className="rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Performance des devis</h2>
              <p className="mt-1 text-xs text-muted-foreground">Transformation commerciale de la période</p>
            </div>
            <FileCheck2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums">{formatPercent(quoteRate)}</p>
              <p className="mt-1 text-xs text-muted-foreground">devis acceptés</p>
            </div>
            <Badge variant="secondary" className="rounded-full bg-done-soft text-done">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {integer.format(totals.acceptedQuotes)} / {integer.format(totals.quoteCount)}
            </Badge>
          </div>
          <Progress value={Math.min(100, quoteRate)} className="mt-5 h-2" />
          <div className="mt-6 border-t border-border pt-5">
            <MiniStat label="Montant des devis acceptés" value={euro.format(totals.acceptedQuoteAmount)} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <TopCustomersTable rows={topCustomers} />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <BreakdownCard
            icon={Landmark}
            title="Origine des règlements"
            description="Moyens de paiement détaillés et montants consolidés"
            rows={paymentMethods}
            empty="Les règlements sont consolidés dans les factures Onify, sans détail de moyen de paiement."
          />
          <BreakdownCard
            icon={ShieldCheck}
            title="Exposition par assureur"
            description="Montants assurance des factures rattachées à un dossier"
            rows={insurerExposure}
            empty="Aucun montant assurance n'est encore ventilé par compagnie."
          />
        </div>
      </div>
    </>
  );
}

function FinancialStatementCard({ totals }: { totals: FinancialTotals }) {
  return (
    <Card className="rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Calcul de la marge brute</h2><p className="mt-1 text-xs text-muted-foreground">Revenus HT moins achats fournisseurs HT</p></div>
        <CircleDollarSign className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-5 space-y-3">
        <StatementRow label="Chiffre d'affaires HT" value={totals.amountHt} />
        <StatementRow label="Avoirs clients HT" value={-totals.creditsHt} tone="danger" />
        <div className="border-t border-border pt-3"><StatementRow label="CA net HT" value={totals.netRevenueHt} strong /></div>
        <StatementRow label="Achats fournisseurs HT" value={-totals.supplierPurchasesHt} tone="danger" />
        <div className="border-t border-border pt-3"><StatementRow label="Marge brute HT" value={totals.margin} strong tone={totals.margin >= 0 ? 'success' : 'danger'} /></div>
        <div className="flex items-center justify-between gap-4 text-xs"><span className="text-muted-foreground">Taux de marge brute</span><span className="font-semibold tabular-nums text-done">{formatPercent(ratio(totals.margin, totals.netRevenueHt))}</span></div>
      </div>
    </Card>
  );
}

function StatementRow({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: 'success' | 'danger' }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 text-xs', strong && 'text-sm font-semibold')}>
      <span className={strong ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className={cn('tabular-nums', tone === 'success' && 'text-done', tone === 'danger' && 'text-urgent')}>{euro.format(value)}</span>
    </div>
  );
}

function ForecastCard({ forecast, total }: { forecast: ReturnType<typeof buildForecast>; total: number }) {
  return (
    <Card className="rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Prévision de trésorerie</h2><p className="mt-1 text-xs text-muted-foreground">Quand le reste dû doit entrer</p></div>
        <CalendarClock className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-5 space-y-4">
        <ProgressRow label="Déjà en retard" value={forecast.overdue} total={total} color="bg-urgent" />
        <ProgressRow label="Dans les 7 jours" value={forecast.days7} total={total} color="bg-due" />
        <ProgressRow label="Dans les 8 à 30 jours" value={forecast.days30} total={total} color="bg-primary" />
        <ProgressRow label="Après 30 jours" value={forecast.later} total={total} color="bg-upcoming" />
        <ProgressRow label="Sans échéance" value={forecast.noDueDate} total={total} color="bg-muted-foreground" />
      </div>
    </Card>
  );
}

function InvoiceStatusCard({ statuses, total }: { statuses: ReturnType<typeof buildStatuses>; total: number }) {
  return (
    <Card className="rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Statut des factures</h2><p className="mt-1 text-xs text-muted-foreground">Volume et montant par étape</p></div>
        <ListChecks className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-5 space-y-4">
        {statuses.map((status) => (
          <div key={status.status}>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{status.label} <span className="text-[10px]">({status.count})</span></span>
              <span className="font-medium tabular-nums">{euro.format(status.amount)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', status.color)} style={{ width: `${Math.min(100, ratio(status.amount, total))}%` }} /></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DataQualityCard({ quality }: { quality: ReturnType<typeof buildQuality> }) {
  const totalIssues = quality.reduce((total, item) => total + item.count, 0);
  return (
    <Card className="rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Fiabilité des données</h2><p className="mt-1 text-xs text-muted-foreground">Points à compléter pour mieux piloter</p></div>
        {totalIssues ? <TriangleAlert className="h-4 w-4 text-due" /> : <CheckCircle2 className="h-4 w-4 text-done" />}
      </div>
      <div className="mt-5 space-y-3">
        {quality.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <Badge variant="secondary" className={cn('rounded-full tabular-nums', item.count ? 'bg-due-soft text-due' : 'bg-done-soft text-done')}>{item.count}</Badge>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-4 text-muted-foreground">La marge brute repose sur les factures et achats présents dans le CRM. Elle ne remplace pas le résultat comptable net.</p>
    </Card>
  );
}

function TopCustomersTable({ rows }: { rows: ReturnType<typeof buildTopCustomers> }) {
  return (
    <Card className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div><h2 className="text-sm font-semibold">Clients principaux</h2><p className="mt-1 text-xs text-muted-foreground">Chiffre d'affaires net, encaissement et exposition</p></div>
        <UsersRound className="h-4 w-4 text-primary" />
      </div>
      {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Aucune facture sur cette période.</p> : (
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Client</TableHead><TableHead className="text-right">Factures</TableHead><TableHead className="text-right">CA net</TableHead><TableHead className="text-right">Encaissé</TableHead><TableHead className="text-right">Reste dû</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((row) => (
            <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right text-muted-foreground">{row.count}</TableCell><TableCell className="text-right tabular-nums">{euro.format(row.revenue)}</TableCell><TableCell className="text-right tabular-nums text-done">{euro.format(row.collected)}</TableCell><TableCell className={cn('text-right font-medium tabular-nums', row.outstanding > 0 && 'text-urgent')}>{euro.format(row.outstanding)}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Card>
  );
}

function BreakdownCard({ icon: Icon, title, description, rows, empty }: {
  icon: typeof Landmark;
  title: string;
  description: string;
  rows: Array<{ id: string; label: string; amount: number; detail: string }>;
  empty: string;
}) {
  const total = sum(rows.map((row) => row.amount));
  return (
    <Card className="rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Icon className="h-4 w-4 text-primary" /></div>
      {rows.length === 0 ? <p className="mt-5 rounded-lg bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">{empty}</p> : (
        <div className="mt-5 space-y-4">{rows.map((row) => (
          <div key={row.id}><div className="mb-2 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">{row.label} <span className="text-[10px]">{row.detail}</span></span><span className="font-medium tabular-nums">{euro.format(row.amount)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, ratio(row.amount, total))}%` }} /></div></div>
        ))}</div>
      )}
    </Card>
  );
}

function MetricCard({ icon: Icon, label, value, detail, trend, tone = 'neutral' }: {
  icon: typeof Receipt;
  label: string;
  value: string;
  detail: string;
  trend?: number;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  return (
    <Card className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tone === 'danger' ? 'bg-urgent-soft text-urgent' : tone === 'success' ? 'bg-done-soft text-done' : 'bg-primary/10 text-primary')}>
          <Icon className="h-4 w-4" />
        </div>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 min-h-8 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </Card>
  );
}

function TrendBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <Badge variant="secondary" className={cn('rounded-full text-[10px]', positive ? 'bg-done-soft text-done' : 'bg-urgent-soft text-urgent')}>
      {positive ? <ArrowUpRight className="mr-0.5 h-3 w-3" /> : <ArrowDownRight className="mr-0.5 h-3 w-3" />}
      {Math.abs(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}%
    </Badge>
  );
}

function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = Math.min(100, ratio(value, total));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{euro.format(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-700', color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>;
}

function OverdueTable({ rows }: { rows: ReturnType<typeof buildView>['overdue'] }) {
  return (
    <Card className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="text-sm font-semibold">Factures à relancer en priorité</h2>
          <p className="mt-1 text-xs text-muted-foreground">Classées par ancienneté puis par montant restant</p>
        </div>
        <WalletCards className="h-4 w-4 text-urgent" />
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10 text-center">
          <CheckCircle2 className="h-7 w-7 text-done" />
          <p className="mt-3 text-sm font-medium">Aucun impayé arrivé à échéance</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Facture</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead className="text-right">Retard</TableHead>
              <TableHead className="text-right">Reste dû</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.invoice.id}>
                <TableCell className="font-medium">{row.invoice.invoice_number}</TableCell>
                <TableCell className="text-muted-foreground">{row.contactName}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(row.invoice.due_date)}</TableCell>
                <TableCell className="text-right"><Badge variant="outline" className="rounded-full border-urgent/25 bg-urgent-soft text-urgent">{row.daysLate} j</Badge></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{euro.format(outstandingAmount(row.invoice))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Calcul des indicateurs financiers…</p></div>
    </div>
  );
}

function buildView(data: FinancialDashboardData, period: FinancialPeriod) {
  const now = new Date();
  const range = periodRange(period, now);
  const invoices = data.invoices.filter((item) => inRange(item.issue_date, range.start, range.end));
  const credits = data.credits.filter((item) => inRange(item.issue_date ?? item.created_at, range.start, range.end));
  const quotes = data.quotes.filter((item) => inRange(item.created_at, range.start, range.end));
  const gifts = data.gifts.filter((item) => inRange(item.given_at ?? item.created_at, range.start, range.end));
  const payments = data.payments.filter((item) => inRange(item.payment_date, range.start, range.end));
  const supplierExpenses = data.supplierExpenses.filter((item) => inRange(item.invoice_date, range.start, range.end));
  const totals = calculateTotals(invoices, credits, quotes, gifts, supplierExpenses);

  const previous = range.previousStart && range.previousEnd
    ? calculateTotals(
      data.invoices.filter((item) => inRange(item.issue_date, range.previousStart, range.previousEnd)),
      data.credits.filter((item) => inRange(item.issue_date ?? item.created_at, range.previousStart, range.previousEnd)),
      data.quotes.filter((item) => inRange(item.created_at, range.previousStart, range.previousEnd)),
      data.gifts.filter((item) => inRange(item.given_at ?? item.created_at, range.previousStart, range.previousEnd)),
      data.supplierExpenses.filter((item) => inRange(item.invoice_date, range.previousStart, range.previousEnd)),
    )
    : null;

  const contacts = new Map(data.contacts.map((contact) => [contact.id, [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Client sans nom']));
  const invoiceRows = invoices.map((invoice) => ({
    invoice,
    contactName: invoice.contact_id ? contacts.get(invoice.contact_id) ?? 'Client inconnu' : 'Client non rattaché',
  }));
  const overdue = invoiceRows
    .filter(({ invoice }) => isOverdue(invoice, now))
    .map(({ invoice, contactName }) => ({
      invoice,
      contactName,
      daysLate: Math.max(1, daysBetween(new Date(invoice.due_date ?? invoice.issue_date), now)),
    }))
    .sort((a, b) => b.daysLate - a.daysLate || outstandingAmount(b.invoice) - outstandingAmount(a.invoice))
    .slice(0, 8);

  const firstInvoiceDate = earliestDate(invoices.map((invoice) => invoice.issue_date));
  const coverageStart = range.start && firstInvoiceDate
    ? new Date(Math.max(range.start.getTime(), firstInvoiceDate.getTime()))
    : range.start ?? firstInvoiceDate ?? now;
  const periodDays = Math.max(1, daysBetween(coverageStart, range.end) + 1);

  return {
    period,
    totals,
    previous,
    timeline: buildTimeline(
      invoices,
      credits,
      payments,
      period,
      range,
      now,
    ),
    overdue,
    aging: buildAging(invoices, now),
    collectionRate: ratio(totals.collected, totals.billed),
    quoteRate: ratio(totals.acceptedQuotes, totals.quoteCount),
    estimatedDso: totals.billed > 0 ? (totals.outstanding / totals.billed) * periodDays : 0,
    forecast: buildForecast(invoices, now),
    statuses: buildStatuses(invoices),
    topCustomers: buildTopCustomers(invoices, credits, contacts),
    paymentMethods: buildPaymentMethods(invoices, payments),
    insurerExposure: buildInsurerExposure(invoices, data),
    quality: buildQuality(invoices, supplierExpenses),
    invoiceRows,
  };
}

function calculateTotals(
  invoices: Invoice[],
  credits: OnifyCreditNote[],
  quotes: FinancialDashboardData['quotes'],
  gifts: FinancialDashboardData['gifts'],
  supplierExpenses: FinancialDashboardData['supplierExpenses'],
): FinancialTotals {
  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'cancelled');
  const activeCredits = credits.filter((credit) => !String(credit.status ?? '').toLocaleLowerCase('fr-FR').includes('brouillon'));
  const billed = sum(activeInvoices.map((invoice) => numeric(invoice.amount_ttc)));
  const amountHt = sum(activeInvoices.map((invoice) => numeric(invoice.amount_ht)));
  const creditAmount = sum(activeCredits.map((credit) => numeric(credit.amount_ttc)));
  const creditAmountHt = sum(activeCredits.map(creditAmountExcludingTax));
  const supplierPurchasesHt = sum(supplierExpenses.map((expense) => numeric(expense.amount_ht)));
  const supplierPurchasesTtc = sum(supplierExpenses.map((expense) => numeric(expense.amount_ttc)));
  const netRevenueHt = amountHt - creditAmountHt;
  const acceptedQuotes = quotes.filter((quote) => quote.status === 'accepted');
  const now = new Date();
  const overdueInvoices = activeInvoices.filter((invoice) => isOverdue(invoice, now));
  return {
    amountHt,
    vat: Math.max(0, billed - amountHt),
    billed,
    credits: creditAmount,
    creditsHt: creditAmountHt,
    draftCredits: credits.length - activeCredits.length,
    netRevenue: billed - creditAmount,
    netRevenueHt,
    collected: sum(activeInvoices.map((invoice) => numeric(invoice.amount_paid))),
    outstanding: sum(activeInvoices.map(outstandingAmount)),
    margin: netRevenueHt - supplierPurchasesHt,
    supplierPurchasesHt,
    supplierPurchasesTtc,
    supplierPurchaseDocuments: supplierExpenses.length,
    gifts: sum(gifts.filter((gift) => gift.status !== 'cancelled').map((gift) => numeric(gift.amount))),
    invoiceCount: activeInvoices.length,
    overdueCount: overdueInvoices.length,
    overdueAmount: sum(overdueInvoices.map(outstandingAmount)),
    acceptedQuotes: acceptedQuotes.length,
    quoteCount: quotes.length,
    acceptedQuoteAmount: sum(acceptedQuotes.map((quote) => numeric(quote.amount_ttc))),
    insurance: sum(activeInvoices.map((invoice) => numeric(invoice.insurance_amount))),
    franchise: sum(activeInvoices.map((invoice) => numeric(invoice.franchise_amount))),
  };
}

function buildTimeline(
  invoices: Invoice[],
  credits: OnifyCreditNote[],
  payments: FinancialDashboardData['payments'],
  period: FinancialPeriod,
  range: DateRange,
  now: Date,
): TimelinePoint[] {
  const monthly = period !== '30d';
  const start = range.start ?? earliestDate([
    ...invoices.map((item) => item.issue_date),
    ...credits.map((item) => item.issue_date ?? item.created_at),
  ]) ?? startOfYear(now);
  const points = new Map<string, TimelinePoint>();
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  if (monthly) cursor.setDate(1);
  let guard = 0;
  while (cursor <= range.end && guard < 370) {
    const key = monthly ? monthKey(cursor) : dayKey(cursor);
    points.set(key, { key, label: monthly ? monthLabel(cursor) : dayLabel(cursor), facture: 0, encaisse: 0, avoirs: 0 });
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  const invoicesWithDetailedPayments = new Set(
    payments.map((payment) => payment.invoice_id).filter((id): id is string => Boolean(id)),
  );
  for (const invoice of invoices.filter((item) => item.status !== 'cancelled')) {
    const date = validDate(invoice.issue_date);
    if (!date) continue;
    const point = points.get(monthly ? monthKey(date) : dayKey(date));
    if (!point) continue;
    point.facture += numeric(invoice.amount_ttc);
    // Un paiement detaille donne la vraie date d'encaissement. Pour les
    // factures Onify qui n'en ont pas, le montant paye reste rattache a la
    // date de facture afin de ne pas disparaitre du graphique.
    if (!invoicesWithDetailedPayments.has(invoice.id)) {
      point.encaisse += numeric(invoice.amount_paid);
    }
  }
  for (const payment of payments) {
    const date = validDate(payment.payment_date);
    if (!date) continue;
    const point = points.get(monthly ? monthKey(date) : dayKey(date));
    if (point) point.encaisse += numeric(payment.amount);
  }
  for (const credit of credits.filter((item) => !String(item.status ?? '').toLocaleLowerCase('fr-FR').includes('brouillon'))) {
    const date = validDate(credit.issue_date ?? credit.created_at);
    if (!date) continue;
    const point = points.get(monthly ? monthKey(date) : dayKey(date));
    if (point) point.avoirs += numeric(credit.amount_ttc);
  }
  return [...points.values()];
}

function buildAging(invoices: Invoice[], now: Date) {
  const result = { upcoming: 0, days30: 0, days60: 0, over60: 0 };
  for (const invoice of invoices.filter((item) => item.status !== 'cancelled')) {
    const amount = outstandingAmount(invoice);
    if (amount <= 0) continue;
    const due = validDate(invoice.due_date);
    if (!due || due >= now) result.upcoming += amount;
    else {
      const late = daysBetween(due, now);
      if (late <= 30) result.days30 += amount;
      else if (late <= 60) result.days60 += amount;
      else result.over60 += amount;
    }
  }
  return result;
}

function buildForecast(invoices: Invoice[], now: Date) {
  const result = { overdue: 0, days7: 0, days30: 0, later: 0, noDueDate: 0 };
  for (const invoice of invoices.filter((item) => item.status !== 'cancelled')) {
    const amount = outstandingAmount(invoice);
    if (amount <= 0) continue;
    const due = validDate(invoice.due_date);
    if (!due) result.noDueDate += amount;
    else {
      const days = daysBetween(now, due);
      if (days < 0) result.overdue += amount;
      else if (days <= 7) result.days7 += amount;
      else if (days <= 30) result.days30 += amount;
      else result.later += amount;
    }
  }
  return result;
}

function buildStatuses(invoices: Invoice[]) {
  const definitions: Array<{ status: Invoice['status']; label: string; color: string }> = [
    { status: 'paid', label: 'Payées', color: 'bg-done' },
    { status: 'partial', label: 'Partiellement payées', color: 'bg-due' },
    { status: 'sent', label: 'Envoyées', color: 'bg-primary' },
    { status: 'overdue', label: 'En retard', color: 'bg-urgent' },
    { status: 'draft', label: 'Brouillons', color: 'bg-muted-foreground' },
  ];
  return definitions.map((definition) => {
    const rows = invoices.filter((invoice) => invoice.status === definition.status);
    return {
      ...definition,
      count: rows.length,
      amount: sum(rows.map((invoice) => numeric(invoice.amount_ttc))),
    };
  });
}

function buildTopCustomers(
  invoices: Invoice[],
  credits: OnifyCreditNote[],
  contacts: Map<string, string>,
) {
  const rows = new Map<string, { id: string; name: string; count: number; revenue: number; collected: number; outstanding: number }>();
  for (const invoice of invoices.filter((item) => item.status !== 'cancelled')) {
    const id = invoice.contact_id ?? '__unassigned';
    const row = rows.get(id) ?? {
      id,
      name: invoice.contact_id ? contacts.get(invoice.contact_id) ?? 'Client inconnu' : 'Client non rattaché',
      count: 0, revenue: 0, collected: 0, outstanding: 0,
    };
    row.count++;
    row.revenue += numeric(invoice.amount_ttc);
    row.collected += numeric(invoice.amount_paid);
    row.outstanding += outstandingAmount(invoice);
    rows.set(id, row);
  }
  for (const credit of credits.filter((item) => !String(item.status ?? '').toLocaleLowerCase('fr-FR').includes('brouillon'))) {
    const id = credit.contact_id ?? '__unassigned';
    const row = rows.get(id);
    if (row) row.revenue -= numeric(credit.amount_ttc);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
}

function buildPaymentMethods(invoices: Invoice[], payments: FinancialDashboardData['payments']) {
  const labels: Record<string, string> = {
    transfer: 'Virement', check: 'Chèque', cash: 'Espèces', card: 'Carte', other: 'Autre',
  };
  const grouped = new Map<string, { id: string; label: string; amount: number; count: number }>();
  for (const payment of payments) {
    const id = payment.payment_method || 'other';
    const row = grouped.get(id) ?? { id, label: labels[id] ?? id, amount: 0, count: 0 };
    row.amount += numeric(payment.amount);
    row.count++;
    grouped.set(id, row);
  }
  const detailedInvoiceIds = new Set(payments.map((payment) => payment.invoice_id).filter(Boolean));
  const consolidated = sum(invoices
    .filter((invoice) => !detailedInvoiceIds.has(invoice.id))
    .map((invoice) => numeric(invoice.amount_paid)));
  if (consolidated > 0) {
    grouped.set('consolidated', {
      id: 'consolidated', label: 'Onify consolidé', amount: consolidated,
      count: invoices.filter((invoice) => !detailedInvoiceIds.has(invoice.id) && numeric(invoice.amount_paid) > 0).length,
    });
  }
  return [...grouped.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((row) => ({ ...row, detail: `· ${row.count} opération${row.count > 1 ? 's' : ''}` }));
}

function buildInsurerExposure(invoices: Invoice[], data: FinancialDashboardData) {
  const caseInsurers = new Map(data.cases.map((item) => [item.id, item.insurer_id]));
  const insurerNames = new Map(data.insurers.map((item) => [item.id, item.name]));
  const grouped = new Map<string, { id: string; label: string; amount: number; count: number }>();
  for (const invoice of invoices.filter((item) => item.status !== 'cancelled' && numeric(item.insurance_amount) > 0)) {
    const insurerId = invoice.case_id ? caseInsurers.get(invoice.case_id) ?? '__unknown' : '__unknown';
    const row = grouped.get(insurerId) ?? {
      id: insurerId,
      label: insurerId === '__unknown' ? 'Assureur non renseigné' : insurerNames.get(insurerId) ?? 'Assureur inconnu',
      amount: 0,
      count: 0,
    };
    row.amount += numeric(invoice.insurance_amount);
    row.count++;
    grouped.set(insurerId, row);
  }
  return [...grouped.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((row) => ({ ...row, detail: `· ${row.count} facture${row.count > 1 ? 's' : ''}` }));
}

function buildQuality(invoices: Invoice[], supplierExpenses: FinancialDashboardData['supplierExpenses']) {
  const active = invoices.filter((invoice) => invoice.status !== 'cancelled');
  return [
    { label: 'Factures sans client', count: active.filter((invoice) => !invoice.contact_id).length },
    { label: 'Restes dus sans échéance', count: active.filter((invoice) => outstandingAmount(invoice) > 0 && !invoice.due_date).length },
    { label: 'Achats fournisseurs sans détail', count: supplierExpenses.filter((expense) => expense.items.length === 0).length },
    { label: 'Factures encore en brouillon', count: active.filter((invoice) => invoice.status === 'draft').length },
  ];
}

function exportFinancialCsv(view: ReturnType<typeof buildView>) {
  const header = ['Facture', 'Date', 'Client', 'Statut', 'Montant HT', 'TVA', 'Montant TTC', 'Encaissé', 'Reste dû', 'Marge estimée'];
  const rows = view.invoiceRows.map(({ invoice, contactName }) => [
    invoice.invoice_number,
    formatDate(invoice.issue_date),
    contactName,
    invoice.status,
    numeric(invoice.amount_ht),
    Math.max(0, numeric(invoice.amount_ttc) - numeric(invoice.amount_ht)),
    numeric(invoice.amount_ttc),
    numeric(invoice.amount_paid),
    outstandingAmount(invoice),
    numeric(invoice.estimated_margin),
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pilotage-financier-${view.period}-${dayKey(new Date())}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function periodRange(period: FinancialPeriod, now: Date): DateRange {
  const end = new Date(now);
  if (period === 'all') return { start: null, end, previousStart: null, previousEnd: null };
  if (period === 'year') {
    const start = startOfYear(now);
    const previousStart = new Date(now.getFullYear() - 1, 0, 1);
    const previousEnd = new Date(now);
    previousEnd.setFullYear(now.getFullYear() - 1);
    return { start, end, previousStart, previousEnd };
  }
  const duration = period === '30d' ? 30 : 90;
  const start = addDays(now, -(duration - 1));
  start.setHours(0, 0, 0, 0);
  const previousEnd = addDays(start, -1);
  previousEnd.setHours(23, 59, 59, 999);
  const previousStart = addDays(previousEnd, -(duration - 1));
  previousStart.setHours(0, 0, 0, 0);
  return { start, end, previousStart, previousEnd };
}

function outstandingAmount(invoice: Invoice): number {
  // Le statut metier est prioritaire : certaines anciennes factures Onify
  // payees conservent un reliquat technique qui ne doit pas devenir un impaye.
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return 0;
  const stored = numeric(invoice.remaining_amount);
  if (stored > 0) return stored;
  return Math.max(0, numeric(invoice.amount_ttc) - numeric(invoice.amount_paid));
}

function isOverdue(invoice: Invoice, now: Date): boolean {
  if (invoice.status === 'paid' || invoice.status === 'cancelled' || outstandingAmount(invoice) <= 0) return false;
  const due = validDate(invoice.due_date);
  return invoice.status === 'overdue' || Boolean(due && due < now);
}

function variation(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function ratio(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function safeDivide(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function creditAmountExcludingTax(credit: OnifyCreditNote): number {
  const totals = credit.onify_payload?.totals;
  if (totals && typeof totals === 'object' && !Array.isArray(totals)) {
    const values = totals as Record<string, unknown>;
    const exact = numeric(values.final_total_ht ?? values.total_ht ?? values.subtotal_ht);
    if (exact > 0) return exact;
  }
  return numeric(credit.amount_ttc) / 1.2;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(value: string | null | undefined, start: Date | null, end: Date | null): boolean {
  const date = validDate(value);
  return Boolean(date && (!start || date >= start) && (!end || date <= end));
}

function earliestDate(values: Array<string | null | undefined>): Date | null {
  const dates = values.map(validDate).filter((value): value is Date => Boolean(value));
  return dates.length ? new Date(Math.min(...dates.map((value) => value.getTime()))) : null;
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function compactEuro(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k€`;
  return `${Math.round(value)} €`;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function formatDate(value: string | null): string {
  const date = validDate(value);
  return date ? date.toLocaleDateString('fr-FR') : '—';
}
