import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Banknote, Building2, CalendarRange, CheckCircle2, Clock3,
  Coins, ExternalLink, FileSearch, Landmark, ListTodo, ReceiptText,
  ShieldCheck, WalletCards,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { accountingConsolidatedSnapshot as snapshot } from './accounting-consolidated-snapshot';

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat('fr-FR');
const percent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const localControlSources = import.meta.env.DEV ? [
  { label: 'Factures', url: 'https://docs.google.com/spreadsheets/d/1JTsoLfFzY2imhZVnuxEYV6qLXcVAPQBLwxRkkDvGELM/edit?gid=210001#gid=210001' },
  { label: 'Avoirs', url: 'https://docs.google.com/spreadsheets/d/1JTsoLfFzY2imhZVnuxEYV6qLXcVAPQBLwxRkkDvGELM/edit?gid=210002#gid=210002' },
  { label: 'Offres', url: 'https://docs.google.com/spreadsheets/d/1JTsoLfFzY2imhZVnuxEYV6qLXcVAPQBLwxRkkDvGELM/edit?gid=210003#gid=210003' },
  { label: 'Paiements reçus', url: 'https://docs.google.com/spreadsheets/d/1JTsoLfFzY2imhZVnuxEYV6qLXcVAPQBLwxRkkDvGELM/edit?gid=317117558#gid=317117558' },
  { label: 'TIIME', url: 'https://apps.tiime.fr/companies/418065/account/transactions?page=1&hide_refused=false' },
  { label: 'Dossier PDF', url: 'https://drive.google.com/drive/folders/1TIP7ECdt4nE-zE9ObMp_3fqWLO5mSHmX' },
] : [];

export function AccountingConsolidatedSection() {
  const { summary, receivables, creditsAndOffers, bank, cheques, dataQuality } = snapshot;

  return (
    <section className="space-y-5 border-t border-border pt-7" data-accounting-snapshot={snapshot.asOf}>
      <Card className="overflow-hidden rounded-xl border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-primary text-primary-foreground">Snapshot externe provisoire</Badge>
              <Badge variant="outline" className="rounded-full border-done/30 bg-done-soft text-done">Wambrechies exclu</Badge>
              <Badge variant="outline" className="rounded-full">Arrêté au 08/09/2026</Badge>
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Vue consolidée comptable — arrêté au 08/09/2026</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Cette lecture figée complète les données natives et synchronisées affichées au-dessus. Elle rapproche ONIFY,
              RéseauGlass, TIIME, la banque et le registre des chèques sans remplacer les écritures comptables définitives.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/80 px-4 py-3 text-xs">
            <p className="font-medium">Périmètre analysé</p>
            <p className="mt-1 text-muted-foreground">19/09/2025 → 08/09/2026</p>
            <p className="mt-2 text-muted-foreground">Version locale de contrôle</p>
          </div>
        </div>
      </Card>

      <Alert className="border-due/35 bg-due-soft/35">
        <AlertTriangle className="h-4 w-4 text-due" />
        <AlertTitle>Lecture prudente obligatoire</AlertTitle>
        <AlertDescription>
          Le flux bancaire net de {euro.format(bank.externalNetCashFlow)} représente une variation de trésorerie, jamais un bénéfice.
          La rentabilité nette reste indéterminable tant que toutes les charges, la paie, le stock et les écritures d’inventaire ne sont pas intégrés.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SnapshotMetric icon={WalletCards} label="Trésorerie disponible" value={euro.format(summary.cashAvailable)} detail="TIIME + BNP · les opérations en attente sont déjà incluses dans TIIME" />
        <SnapshotMetric icon={ReceiptText} label="Facturation brute TTC" value={euro.format(summary.billedGrossTtc)} detail={`${integer.format(summary.invoiceCount)} factures sur le périmètre`} />
        <SnapshotMetric icon={Coins} label="Facturation nette théorique" value={euro.format(summary.theoreticalNetBilledTtc)} detail={`${euro.format(summary.creditsRecordedTtc)} d’avoirs enregistrés`} />
        <SnapshotMetric icon={Banknote} label="Paiements enregistrés" value={euro.format(summary.paymentsRecorded)} detail="Avant les 7 paiements TIIME à comptabiliser" tone="success" />
        <SnapshotMetric icon={Clock3} label="Créances positives provisoires" value={euro.format(receivables.positiveProvisionalApprox)} detail="Après réduction des paiements TIIME identifiés" tone="warning" />
        <SnapshotMetric icon={CalendarRange} label="Échu daté provisoire" value={euro.format(receivables.datedOverdueAfterF20260053Approx)} detail={`${integer.format(receivables.datedOverdueInvoiceCount)} factures datées en retard`} tone="danger" />
      </div>

      <Tabs defaultValue="synthese" className="space-y-5">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max rounded-xl bg-muted/70 p-1">
            <TabsTrigger value="synthese" className="rounded-lg">Synthèse</TabsTrigger>
            <TabsTrigger value="creances" className="rounded-lg">Créances</TabsTrigger>
            <TabsTrigger value="offres" className="rounded-lg">Avoirs & offres</TabsTrigger>
            <TabsTrigger value="banque" className="rounded-lg">Banque</TabsTrigger>
            <TabsTrigger value="cheques" className="rounded-lg">Chèques & assureurs</TabsTrigger>
            <TabsTrigger value="qualite" className="rounded-lg">Qualité & actions</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="synthese" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <DataTableCard
              icon={Building2}
              title="Répartition ONIFY / RéseauGlass"
              description="Les soldes affichés restent provisoires avant régularisation des paiements."
              headers={['Source', 'Factures', 'Facturé TTC', 'Paiements', 'Avoirs', 'Solde affiché']}
              rows={snapshot.sourcesBreakdown.map((row) => [
                row.source, integer.format(row.invoiceCount), euro.format(row.billedTtc), euro.format(row.payments),
                euro.format(row.credits), euro.format(row.displayedBalance),
              ])}
              numericColumns={[1, 2, 3, 4, 5]}
            />
            <Card className="rounded-xl border border-border p-5">
              <CardTitle icon={Landmark} title="Trésorerie par compte" description="Disponibilités observées au jour de l’arrêté" />
              <div className="mt-5 space-y-4">
                {summary.cashBreakdown.map((row) => (
                  <AmountBar key={row.label} label={row.label.includes('opérations en attente') ? `dont ${row.label}` : row.label} amount={row.amount} total={summary.cashAvailable} />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <MiniFigure label="Facturation 2026 TTC" value={euro.format(summary.year2026BilledTtc)} detail={`${summary.year2026InvoiceCount} factures`} />
                <MiniFigure label="Offres commerciales virées" value={euro.format(summary.commercialOfferTransfers)} detail={`${summary.commercialOfferTransferCount} virements`} />
              </div>
            </Card>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MiniSummaryCard label="Facturation brute HT" value={summary.billedGrossHt} />
            <MiniSummaryCard label="Facturation 2026 HT" value={summary.year2026BilledHt} />
            <MiniSummaryCard label="Avoirs enregistrés TTC" value={summary.creditsRecordedTtc} />
            <MiniSummaryCard label="Reste net après comptabilisation" value={receivables.netAfterPostingApprox} warning />
          </div>

          <Alert>
            <FileSearch className="h-4 w-4" />
            <AlertTitle>Nature des données</AlertTitle>
            <AlertDescription>
              Les cartes du premier dashboard proviennent directement des tables CRM. Cette section provient d’un rapprochement externe figé au 08/09/2026 ; elle sert à contrôler et régulariser, pas à créer automatiquement des écritures.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="creances" className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MiniSummaryCard label="Avant paiements TIIME" value={receivables.positiveBeforeLivePaymentsApprox} warning />
            <MiniSummaryCard label="Paiements TIIME à passer" value={receivables.livePaymentsNotPostedTotal} detail={`${receivables.livePaymentsNotPostedCount} paiements`} />
            <MiniSummaryCard label="Sans échéance" value={receivables.positiveWithoutDueDateAmount} detail={`${receivables.positiveWithoutDueDateCount} soldes positifs`} warning />
            <MiniSummaryCard label="Statut retard affiché" value={receivables.displayedOverdueStatusCount} detail="nombre de factures" integerValue />
          </div>

          <DataTableCard
            icon={Banknote}
            title="7 paiements TIIME à comptabiliser"
            description="Le nouveau solde est une projection de contrôle. Les différences positives signalent un paiement supérieur au solde affiché."
            headers={['Facture', 'Paiement TIIME', 'Solde affiché', 'Nouveau solde', 'Différence']}
            rows={receivables.livePaymentsToPost.map((row) => [
              row.invoice, euro.format(row.payment), euro.format(row.displayedBalance), euro.format(row.newBalance),
              'difference' in row ? euro.format(row.difference) : '—',
            ])}
            numericColumns={[1, 2, 3, 4]}
          />

          <DataTableCard
            icon={Clock3}
            title="Principales créances à surveiller"
            description="Soldes les plus élevés du snapshot, indépendamment du filtre de période du dashboard natif."
            headers={['Facture', 'Client', 'Solde', 'Échéance']}
            rows={receivables.largestBalances.map((row) => [
              row.invoice, row.customer, euro.format(row.balance), dueStatusLabel(row.dueStatus),
            ])}
            numericColumns={[2]}
          />
        </TabsContent>

        <TabsContent value="offres" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <DataTableCard
              icon={Coins}
              title="Nature des offres commerciales"
              description={`${integer.format(summary.commercialOfferTransferCount)} virements identifiés pour ${euro.format(summary.commercialOfferTransfers)}.`}
              headers={['Catégorie', 'Nombre', 'Montant']}
              rows={creditsAndOffers.breakdown.map((row) => [row.label, integer.format(row.count), euro.format(row.amount)])}
              numericColumns={[1, 2]}
            />
            <DataTableCard
              icon={FileSearch}
              title="Rapprochement offres / avoirs"
              description={`${euro.format(creditsAndOffers.doubleCountRiskAmount)} présentent un risque de double comptage.`}
              headers={['État', 'Nombre', 'Montant']}
              rows={creditsAndOffers.reconciliation.map((row) => [row.label, integer.format(row.count), euro.format(row.amount)])}
              numericColumns={[1, 2]}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="rounded-xl border border-urgent/25 bg-urgent-soft/20 p-5">
              <CardTitle icon={AlertTriangle} title="Alertes prioritaires" description="Paiements à particuliers ou fournisseurs à confirmer" iconClassName="text-urgent" />
              <div className="mt-5 space-y-3">
                {creditsAndOffers.priorityAlerts.map((alert) => (
                  <div key={alert.label} className="flex items-center justify-between rounded-lg bg-background/80 px-3 py-3 text-sm">
                    <div><p className="font-medium">{alert.label}</p><p className="text-xs text-muted-foreground">{'paymentCount' in alert ? `${alert.paymentCount} paiements` : 'qualification à confirmer'}</p></div>
                    <span className="font-semibold tabular-nums text-urgent">{euro.format(alert.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <DataTableCard
              icon={ReceiptText}
              title="Registre des avoirs"
              description="Les avoirs RéseauGlass ne sont pas encore détaillés ligne par ligne."
              headers={['Registre', 'Nombre', 'Montant']}
              rows={[
                ['ONIFY émis', integer.format(snapshot.creditsRegister.onifyIssuedCount), euro.format(snapshot.creditsRegister.onifyIssuedAmount)],
                ['ONIFY brouillons', integer.format(snapshot.creditsRegister.onifyDraftCount), euro.format(snapshot.creditsRegister.onifyDraftAmount)],
                ['RéseauGlass non détaillés', '—', euro.format(snapshot.creditsRegister.reseauGlassCreditsNotItemized)],
              ]}
              numericColumns={[1, 2]}
            />
          </div>
        </TabsContent>

        <TabsContent value="banque" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SnapshotMetric icon={ArrowDownToLine} label="Entrées externes" value={euro.format(bank.externalInflows)} detail={`${integer.format(bank.executedRows)} lignes exécutées`} tone="success" />
            <SnapshotMetric icon={ArrowUpFromLine} label="Sorties externes" value={euro.format(bank.externalOutflows)} detail={`${integer.format(bank.refusedRowsExcluded)} opérations refusées exclues`} tone="danger" />
            <SnapshotMetric icon={Landmark} label="Flux bancaire net" value={euro.format(bank.externalNetCashFlow)} detail="Variation de trésorerie — pas un bénéfice" tone="warning" />
            <SnapshotMetric icon={CalendarRange} label="Flux net 2026" value={euro.format(bank.year2026NetCashFlow)} detail={`${euro.format(bank.year2026Inflows)} entrées · ${euro.format(bank.year2026Outflows)} sorties`} />
          </div>

          <Alert variant="destructive" className="border-urgent/25 bg-urgent-soft/20 text-foreground">
            <AlertTriangle className="h-4 w-4 text-urgent" />
            <AlertTitle>Ce tableau n’est pas un compte de résultat</AlertTitle>
            <AlertDescription>
              Les transferts internes de {euro.format(bank.internalTransfersEachWay)} dans chaque sens sont neutralisés. L’autonomie indicative de {percent.format(bank.indicativeRunwayMonths)} mois est un repère de trésorerie, pas une mesure de rentabilité.
            </AlertDescription>
          </Alert>

          <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
            <DataTableCard
              icon={CalendarRange}
              title="Flux mensuels"
              description="Entrées externes moins sorties externes, transferts internes neutralisés."
              headers={['Mois', 'Flux net']}
              rows={bank.monthlyNetCashFlow.map((row) => [formatMonth(row.month), euro.format(row.amount)])}
              numericColumns={[1]}
              signedColumn={1}
            />
            <DataTableCard
              icon={ArrowUpFromLine}
              title="Principales sorties"
              description="Catégories bancaires brutes à retraiter avant toute lecture de marge."
              headers={['Catégorie', 'Montant', 'Part des sorties']}
              rows={bank.topOutflows.map((row) => [row.label, euro.format(row.amount), `${percent.format((row.amount / bank.externalOutflows) * 100)} %`])}
              numericColumns={[1, 2]}
            />
          </div>

          <DataTableCard
            icon={FileSearch}
            title="Périmètre du relevé bancaire"
            description={`Historique du ${formatIsoDate(bank.historyStart)} au ${formatIsoDate(bank.historyEnd)}. Les transferts internes sont neutralisés dans les flux externes.`}
            headers={['Contrôle', 'Nombre', 'Montant']}
            rows={[
              ['Lignes exploitables', integer.format(bank.parseableRows), '—'],
              ['Lignes exécutées', integer.format(bank.executedRows), '—'],
              ['Lignes refusées exclues', integer.format(bank.refusedRowsExcluded), euro.format(bank.refusedNominalAmountExcluded)],
              ['Lignes structurelles ignorées', integer.format(bank.structuralRowsIgnored), '—'],
              ['Transferts internes neutralisés', '—', `${euro.format(bank.internalTransfersEachWay)} dans chaque sens`],
            ]}
            numericColumns={[1, 2]}
          />

          <WarningList title="Anomalies de classification bancaire" items={bank.classificationWarnings} />
        </TabsContent>

        <TabsContent value="cheques" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniSummaryCard label="Chèques retenus" value={cheques.retainedAmount} detail={`${cheques.retainedRows} lignes`} />
            <MiniSummaryCard label="Remises bancaires" value={cheques.bankDepositsAmount} detail={`${cheques.bankDepositsCount} remises`} />
            <MiniSummaryCard label="Écart registre / banque" value={cheques.registerGap} warning />
            <MiniSummaryCard label="Wambrechies exclu" value={cheques.wambrechiesExcludedAmount} detail={`${cheques.wambrechiesExcludedRows} lignes écartées`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <DataTableCard
              icon={ShieldCheck}
              title="Principaux assureurs"
              description={`Les cinq premiers représentent ${percent.format(cheques.topInsurersSharePercent)} % du registre retenu.`}
              headers={['Assureur', 'Montant', 'Part du registre']}
              rows={cheques.topInsurers.map((row) => [row.insurer, euro.format(row.amount), `${percent.format((row.amount / cheques.retainedAmount) * 100)} %`])}
              numericColumns={[1, 2]}
            />
            <DataTableCard
              icon={FileSearch}
              title="Qualité des rapprochements chèques"
              description={`${integer.format(cheques.sourceRows)} lignes sources analysées avant exclusion Wambrechies.`}
              headers={['Niveau de rapprochement', 'Nombre', 'Observation']}
              rows={[
                ['Correspondances fortes', integer.format(cheques.strongMatches), `${cheques.exactMatches} exactes + ${cheques.abbreviationAndAmountMatches} abréviation/montant`],
                ['Montant seul — provisoire', integer.format(cheques.amountOnlyProvisionalMatches), 'À valider'],
                ['Non rapprochés', integer.format(cheques.unmatched), 'À traiter'],
                ['Ambigus', integer.format(cheques.ambiguous), 'Décision manuelle'],
                ['Doublons probables', integer.format(cheques.probableDuplicateRows), euro.format(cheques.probableDuplicateAmount)],
                ['Montant manquant', integer.format(cheques.missingAmountRows), 'À compléter'],
              ]}
              numericColumns={[1]}
            />
          </div>
        </TabsContent>

        <TabsContent value="qualite" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="rounded-xl border border-done/25 bg-done-soft/15 p-5">
              <CardTitle icon={CheckCircle2} title="Contrôles validés" description="Points fiables dans le snapshot" iconClassName="text-done" />
              <ul className="mt-5 space-y-3">
                {dataQuality.checksPassed.map((item) => <CheckItem key={item} text={item} />)}
              </ul>
            </Card>
            <DataTableCard
              icon={AlertTriangle}
              title="Anomalies de qualité"
              description="Ces volumes empêchent de présenter une clôture comptable définitive."
              headers={['Contrôle', 'Nombre', 'Montant concerné']}
              rows={dataQuality.issues.map((row) => [
                row.label, integer.format(row.count),
                'amountApprox' in row ? `≈ ${euro.format(row.amountApprox)}` : 'amount' in row ? euro.format(row.amount) : '—',
              ])}
              numericColumns={[1, 2]}
            />
          </div>

          <DataTableCard
            icon={AlertTriangle}
            title="Paiements supérieurs au TTC de la facture"
            description="Les excédents doivent être justifiés ou réaffectés avant validation comptable."
            headers={['Facture', 'Excédent']}
            rows={dataQuality.paymentsAboveInvoiceTtc.map((row) => [row.invoice, euro.format(row.excess)])}
            numericColumns={[1]}
          />

          <Card className="rounded-xl border border-border p-5">
            <CardTitle icon={ListTodo} title="Plan d’actions recommandé" description="Ordre de traitement proposé pour fiabiliser la consolidation" />
            <ol className="mt-5 grid gap-3 md:grid-cols-2">
              {snapshot.actionPlan.map((item, index) => (
                <li key={item} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm leading-5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </Card>
        </TabsContent>
      </Tabs>

      {import.meta.env.DEV && (
        <Card className="rounded-xl border-dashed border-border p-5">
          <CardTitle icon={ExternalLink} title="Sources de contrôle — visibles uniquement en local" description="Ces liens sont volontairement masqués dans la version de production." />
          <div className="mt-4 flex flex-wrap gap-2">
            {localControlSources.map((source) => (
              <a key={source.label} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                {source.label}<ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}

function SnapshotMetric({ icon: Icon, label, value, detail, tone = 'neutral' }: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClasses = {
    neutral: 'bg-primary/10 text-primary',
    success: 'bg-done-soft text-done',
    warning: 'bg-due-soft text-due',
    danger: 'bg-urgent-soft text-urgent',
  };
  return (
    <Card className="rounded-xl border border-border p-4">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses[tone])}><Icon className="h-4 w-4" /></div>
      <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 min-h-8 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </Card>
  );
}

function CardTitle({ icon: Icon, title, description, iconClassName }: {
  icon: typeof Landmark;
  title: string;
  description: string;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
      <Icon className={cn('h-4 w-4 shrink-0 text-primary', iconClassName)} />
    </div>
  );
}

function DataTableCard({ icon, title, description, headers, rows, numericColumns = [], signedColumn }: {
  icon: typeof Landmark;
  title: string;
  description: string;
  headers: string[];
  rows: readonly (readonly string[])[];
  numericColumns?: number[];
  signedColumn?: number;
}) {
  return (
    <Card className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border p-5"><CardTitle icon={icon} title={title} description={description} /></div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent">{headers.map((header, index) => <TableHead key={header} className={cn(numericColumns.includes(index) && 'text-right')}>{header}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={`${row[0]}-${rowIndex}`}>
                {row.map((cell, columnIndex) => (
                  <TableCell key={`${columnIndex}-${cell}`} className={cn(
                    columnIndex === 0 && 'font-medium',
                    numericColumns.includes(columnIndex) && 'text-right tabular-nums',
                    signedColumn === columnIndex && signedTone(cell),
                  )}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function MiniSummaryCard({ label, value, detail, warning, integerValue }: {
  label: string;
  value: number;
  detail?: string;
  warning?: boolean;
  integerValue?: boolean;
}) {
  return (
    <Card className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-2 text-xl font-semibold tabular-nums', warning && 'text-due')}>{integerValue ? integer.format(value) : euro.format(value)}</p>
      {detail && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}
    </Card>
  );
}

function MiniFigure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p><p className="text-[10px] text-muted-foreground">{detail}</p></div>;
}

function AmountBar({ label, amount, total }: { label: string; amount: number; total: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{euro.format(amount)}</span></div>
      <Progress value={Math.max(0, Math.min(100, (amount / total) * 100))} className="h-2" />
    </div>
  );
}

function WarningList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <Card className="rounded-xl border border-due/30 bg-due-soft/20 p-5">
      <CardTitle icon={AlertTriangle} title={title} description="Corrections à effectuer avant exploitation comptable" iconClassName="text-due" />
      <ul className="mt-4 grid gap-2 md:grid-cols-2">{items.map((item) => <li key={item} className="flex gap-2 text-sm leading-5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-due" /><span>{item}</span></li>)}</ul>
    </Card>
  );
}

function CheckItem({ text }: { text: string }) {
  return <li className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-done" /><span>{text}</span></li>;
}

function dueStatusLabel(status: string) {
  if (status === 'overdue') return 'En retard';
  if (status === 'not_due') return 'Non échue';
  return 'Échéance manquante';
}

function formatMonth(month: string) {
  if (month === '2026-09-01/08') return '01–08 sept. 2026';
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
}

function formatIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR').format(new Date(year, month - 1, day));
}

function signedTone(value: string) {
  return value.trim().startsWith('-') ? 'text-urgent' : 'text-done';
}
