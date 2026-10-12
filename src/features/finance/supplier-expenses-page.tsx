import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, CreditCard, FileText, PackageOpen, RefreshCw, RotateCcw, Search,
  ShieldAlert, ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fetchEmailAttachment } from '@/features/integrations/email/email-service';
import {
  confirmSupplierExpensePayment, fetchSupplierAccountOverview, fetchSupplierDocumentAnalyses,
  fetchSupplierDocumentJobs, fetchSupplierExpenses, retrySupplierDocumentJob, saveSupplierAccount,
  type SupplierAccountOverview, type SupplierDocumentAnalysis, type SupplierExpense,
  type SupplierExpenseItem,
} from './supplier-expenses-service';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const entier = new Intl.NumberFormat('fr-FR');
const dateCourte = new Intl.DateTimeFormat('fr-FR');
const AUTO_REFRESH_MS = 30_000;

type TypeFiltre = 'all' | SupplierExpense['document_type'];

const documentLabels: Record<SupplierExpense['document_type'], string> = {
  delivery_note: 'BL',
  invoice: 'Facture',
  credit_note: 'Avoir',
};

const statusLabels: Record<NonNullable<SupplierExpense['accounting_status']>, string> = {
  committed: 'Dépense engagée',
  card_to_confirm: 'CB à confirmer',
  paid_card_invoice_pending: 'CB payée · facture attendue',
  invoiced_unpaid: 'Facture reçue · à payer',
  payment_scheduled: 'Paiement planifié',
  paid: 'Payé',
  credited: 'Avoir appliqué',
  review_required: 'À contrôler',
};

function numeric(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateFr(value: string | null) {
  if (!value) return '—';
  return dateCourte.format(new Date(`${value}T12:00:00`));
}

function montant(value: number | null) {
  return value == null ? '—' : euro.format(value);
}

function texteRecherche(expense: SupplierExpense) {
  return [
    expense.supplier, expense.document_number, expense.invoice_number,
    expense.delivery_note_number, expense.order_number, expense.sites,
    ...expense.items.flatMap((item) => [
      item.sku, item.description, item.category, item.site, item.vehicle_registration,
    ]),
  ].filter(Boolean).join(' ').toLocaleLowerCase('fr');
}

export function SupplierExpensesPage() {
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = useState('all');
  const [type, setType] = useState<TypeFiltre>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SupplierExpense | null>(null);
  const [accountToEdit, setAccountToEdit] = useState<SupplierAccountOverview | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('fr'));
  const expensesQuery = useQuery({
    queryKey: ['supplier-expenses'],
    queryFn: fetchSupplierExpenses,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
  const accountsQuery = useQuery({
    queryKey: ['supplier-accounts-overview'],
    queryFn: fetchSupplierAccountOverview,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
  const analysesQuery = useQuery({
    queryKey: ['supplier-document-analyses'],
    queryFn: fetchSupplierDocumentAnalyses,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
  const jobsQuery = useQuery({
    queryKey: ['supplier-document-jobs'],
    queryFn: fetchSupplierDocumentJobs,
    refetchInterval: (query) => (
      (query.state.data ?? []).some((job) => ['pending', 'processing'].includes(job.status)) ? 5_000 : AUTO_REFRESH_MS
    ),
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
  const data = useMemo(() => expensesQuery.data ?? [], [expensesQuery.data]);
  const accounts = accountsQuery.data ?? [];
  const analyses = analysesQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const isFetching = expensesQuery.isFetching || accountsQuery.isFetching || analysesQuery.isFetching || jobsQuery.isFetching;

  const refreshAll = () => Promise.all([
    expensesQuery.refetch(), accountsQuery.refetch(), analysesQuery.refetch(), jobsQuery.refetch(),
  ]);
  const retryMutation = useMutation({
    mutationFn: retrySupplierDocumentJob,
    onSuccess: async () => {
      toast.success('Analyse relancée');
      await refreshAll();
    },
    onError: (mutationError) => toast.error(mutationError instanceof Error ? mutationError.message : 'Relance impossible'),
  });
  const saveAccountMutation = useMutation({
    mutationFn: saveSupplierAccount,
    onSuccess: async () => {
      setAccountToEdit(null);
      toast.success('Plafond fournisseur enregistré');
      await queryClient.invalidateQueries({ queryKey: ['supplier-accounts-overview'] });
    },
    onError: (mutationError) => toast.error(mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible'),
  });

  const suppliers = useMemo(
    () => [...new Set(data.map((expense) => expense.supplier))].sort((a, b) => a.localeCompare(b, 'fr')),
    [data],
  );
  const filtered = useMemo(() => data.filter((expense) => {
    if (supplier !== 'all' && expense.supplier !== supplier) return false;
    if (type !== 'all' && expense.document_type !== type) return false;
    return !deferredSearch || texteRecherche(expense).includes(deferredSearch);
  }), [data, supplier, type, deferredSearch]);
  const totals = useMemo(() => filtered.reduce((result, expense) => ({
    ht: result.ht + numeric(expense.amount_ht),
    vat: result.vat + numeric(expense.vat_amount),
    ttc: result.ttc + numeric(expense.amount_ttc),
    invoices: result.invoices + (expense.document_type === 'invoice' ? 1 : 0),
    credits: result.credits + (expense.document_type === 'credit_note' ? 1 : 0),
    deliveryNotes: result.deliveryNotes + (expense.document_type === 'delivery_note' ? 1 : 0),
    provisionalHt: result.provisionalHt + (expense.amount_basis === 'provisional' ? numeric(expense.amount_ht) : 0),
    cardTtc: result.cardTtc + (expense.payment_method === 'card' ? numeric(expense.amount_ttc) : 0),
    review: result.review + (expense.needs_review ? 1 : 0),
  }), {
    ht: 0, vat: 0, ttc: 0, invoices: 0, credits: 0, deliveryNotes: 0,
    provisionalHt: 0, cardTtc: 0, review: 0,
  }), [filtered]);
  const failedJobs = jobs.filter((job) => job.status === 'failed' || job.status === 'review_required');

  return (
    <>
      <PageHeader
        title="Dépenses fournisseurs"
        description="BL engagés, factures, avoirs, paiements et marge en temps réel"
        action={
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => void refreshAll()} disabled={isFetching} aria-label="Actualiser">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="gutter-x mx-auto max-w-[1500px] space-y-5 py-4 sm:py-6">
          {(expensesQuery.isError || accountsQuery.isError || analysesQuery.isError || jobsQuery.isError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Les dépenses ne peuvent pas être chargées</AlertTitle>
              <AlertDescription>
                {[expensesQuery.error, accountsQuery.error, analysesQuery.error, jobsQuery.error]
                  .find((queryError) => queryError instanceof Error)?.message ?? 'Erreur inconnue'}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={ShoppingCart} label="Coût net HT" value={euro.format(totals.ht)} detail="Déduit immédiatement de la marge" />
            <Metric icon={PackageOpen} label="BL engagés" value={euro.format(totals.provisionalHt)} detail={`${totals.deliveryNotes} dépense${totals.deliveryNotes > 1 ? 's' : ''} provisoire${totals.deliveryNotes > 1 ? 's' : ''}`} />
            <Metric icon={CreditCard} label="Achats par CB" value={euro.format(totals.cardTtc)} detail="Payés ou à confirmer" />
            <Metric icon={ShieldAlert} label="À contrôler" value={entier.format(Math.max(totals.review, failedJobs.length))} detail="Lecture ou rapprochement ambigu" />
          </div>

          {accounts.length > 0 && (
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Plafonds fournisseurs</h2>
                  <p className="text-xs text-muted-foreground">À la limite, le prochain achat passe en carte bancaire à confirmer.</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {accounts.map((account) => (
                  <SupplierAccountCard key={account.supplier} account={account} onEdit={() => setAccountToEdit(account)} />
                ))}
              </div>
            </section>
          )}

          {failedJobs.length > 0 && (
            <Alert className="border-urgent/30 bg-urgent-soft/40">
              <AlertCircle className="h-4 w-4 text-urgent" />
              <AlertTitle>{failedJobs.length} document{failedJobs.length > 1 ? 's' : ''} fournisseur à vérifier</AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                {failedJobs.slice(0, 4).map((job) => (
                  <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-urgent/20 bg-background/70 p-2">
                    <span className="min-w-0 truncate">{job.filename} · {job.last_error || 'Contrôle comptable requis'}</span>
                    {job.status === 'failed' && (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => retryMutation.mutate(job.id)} disabled={retryMutation.isPending}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Relancer
                      </Button>
                    )}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="N° de document, article, site…"
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 lg:flex">
                <Select value={supplier} onValueChange={setSupplier}>
                  <SelectTrigger className="min-w-0 lg:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les fournisseurs</SelectItem>
                    {suppliers.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={type} onValueChange={(value) => setType(value as TypeFiltre)}>
                  <SelectTrigger className="min-w-0 lg:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les documents</SelectItem>
                    <SelectItem value="delivery_note">Bons de livraison</SelectItem>
                    <SelectItem value="invoice">Factures</SelectItem>
                    <SelectItem value="credit_note">Avoirs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {expensesQuery.isLoading ? (
              <p className="p-10 text-center text-sm text-muted-foreground">Chargement des dépenses…</p>
            ) : filtered.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">Aucun document ne correspond aux filtres.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Date</TableHead><TableHead>Fournisseur</TableHead><TableHead>Document</TableHead>
                        <TableHead>Étape comptable</TableHead><TableHead className="text-right">HT</TableHead>
                        <TableHead className="text-right">TVA</TableHead><TableHead className="text-right">TTC</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((expense) => (
                        <TableRow key={expense.id} className={cn('cursor-pointer', expense.needs_review && 'bg-urgent-soft/25')} onClick={() => setSelected(expense)}>
                          <TableCell className="whitespace-nowrap">{dateFr(expense.invoice_date)}</TableCell>
                          <TableCell className="font-medium">{expense.supplier}</TableCell>
                          <TableCell><DocumentBadge expense={expense} /></TableCell>
                          <TableCell><AccountingStatus expense={expense} /></TableCell>
                          <TableCell className="text-right tabular-nums">{euro.format(Number(expense.amount_ht))}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{euro.format(Number(expense.vat_amount))}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{euro.format(Number(expense.amount_ttc))}</TableCell>
                          <TableCell><Button variant="ghost" size="sm">Détail</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y divide-border md:hidden">
                  {filtered.map((expense) => (
                    <button key={expense.id} type="button" onClick={() => setSelected(expense)} className="w-full p-4 text-left active:bg-muted/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="font-medium">{expense.supplier}</p><DocumentBadge expense={expense} /></div>
                        <p className="shrink-0 font-semibold tabular-nums">{euro.format(Number(expense.amount_ttc))}</p>
                      </div>
                      <div className="mt-2"><AccountingStatus expense={expense} /></div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{dateFr(expense.invoice_date)}</span><span className="truncate">{expense.sites || 'Site non précisé'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Card>

          <p className="text-xs text-muted-foreground">
            Les nouveaux PDF reçus par e-mail sont archivés et analysés automatiquement. Pour l’ancien import du 08/10/2026, les fichiers PDF ne sont pas inclus dans cet import.
          </p>
        </div>
      </div>

      <ExpenseDialog
        expense={selected}
        analyses={selected ? analyses.filter((analysis) => (
          analysis.supplier_expense_id === selected.id || analysis.linked_expense_ids.includes(selected.id)
        )) : []}
        onOpenChange={(open) => !open && setSelected(null)}
      />
      {accountToEdit && (
        <SupplierAccountDialog
          key={accountToEdit.supplier}
          account={accountToEdit}
          pending={saveAccountMutation.isPending}
          onOpenChange={(open) => !open && setAccountToEdit(null)}
          onSave={(input) => saveAccountMutation.mutate(input)}
        />
      )}
    </>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof ShoppingCart; label: string; value: string; detail: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </Card>
  );
}

function SupplierAccountCard({ account, onEdit }: { account: SupplierAccountOverview; onEdit: () => void }) {
  const usage = account.usage_percent == null ? 0 : Math.min(100, numeric(account.usage_percent));
  const warningThreshold = numeric(account.warning_threshold || 80);
  const tone = account.credit_limit_reached ? 'danger' : usage >= warningThreshold ? 'warning' : 'normal';
  return (
    <Card className={cn(
      'rounded-xl border border-border p-4',
      tone === 'danger' && 'border-urgent/30 bg-urgent-soft/30',
      tone === 'warning' && 'border-due/30 bg-due-soft/25',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{account.supplier}</p>
          <p className="mt-1 text-xs text-muted-foreground">Échéance 30 jours fin de mois</p>
        </div>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onEdit}>Configurer</Button>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Encours fournisseur</p>
          <p className="text-xl font-semibold tabular-nums">{euro.format(numeric(account.outstanding_ttc))}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{account.credit_limit_ttc == null ? 'Plafond à renseigner' : `sur ${euro.format(numeric(account.credit_limit_ttc))}`}</p>
          {account.remaining_credit_ttc != null && <p>{euro.format(numeric(account.remaining_credit_ttc))} disponible</p>}
        </div>
      </div>
      <Progress value={usage} className="mt-3 h-2" />
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full bg-muted px-2 py-1"><PackageOpen className="mr-1 inline h-3 w-3" />{account.provisional_documents} BL provisoire{account.provisional_documents > 1 ? 's' : ''}</span>
        <span className="rounded-full bg-muted px-2 py-1"><CreditCard className="mr-1 inline h-3 w-3" />{euro.format(numeric(account.paid_card_ttc))} par CB</span>
        {account.review_documents > 0 && <span className="rounded-full bg-urgent-soft px-2 py-1 text-urgent"><ShieldAlert className="mr-1 inline h-3 w-3" />{account.review_documents} à contrôler</span>}
      </div>
      {account.credit_limit_reached && (
        <p className="mt-3 text-xs font-medium text-urgent">Plafond atteint : les nouveaux achats passent en CB à confirmer.</p>
      )}
    </Card>
  );
}

function SupplierAccountDialog({
  account,
  pending,
  onOpenChange,
  onSave,
}: {
  account: SupplierAccountOverview;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    supplier: string;
    creditLimitTtc: number | null;
    warningThreshold: number;
    autoCardOverLimit: boolean;
  }) => void;
}) {
  const [limit, setLimit] = useState(account.credit_limit_ttc == null ? '' : String(account.credit_limit_ttc));
  const [threshold, setThreshold] = useState(String(account.warning_threshold ?? 80));
  const [autoCard, setAutoCard] = useState(account.auto_card_over_limit ?? true);
  const submit = () => {
    const creditLimitTtc = limit.trim() ? Number(limit.replace(',', '.')) : null;
    const warningThreshold = Number(threshold.replace(',', '.'));
    if (creditLimitTtc != null && (!Number.isFinite(creditLimitTtc) || creditLimitTtc < 0)) {
      toast.error('Le plafond doit être un montant positif');
      return;
    }
    if (!Number.isFinite(warningThreshold) || warningThreshold < 0 || warningThreshold > 100) {
      toast.error('Le seuil d’alerte doit être compris entre 0 et 100 %');
      return;
    }
    onSave({ supplier: account.supplier, creditLimitTtc, warningThreshold, autoCardOverLimit: autoCard });
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Compte fournisseur · {account.supplier}</DialogTitle>
          <DialogDescription>Le BL réduit immédiatement la marge. Au plafond, le CRM demande de confirmer un paiement CB.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="supplier-credit-limit">Plafond TTC autorisé</Label>
            <Input id="supplier-credit-limit" inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="Ex. 10 000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-warning-threshold">Alerte à partir de (%)</Label>
            <Input id="supplier-warning-threshold" inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
            <div>
              <p className="text-sm font-medium">Basculer les nouveaux achats en CB</p>
              <p className="text-xs text-muted-foreground">Le paiement reste « à confirmer » jusqu’à présence d’une preuve.</p>
            </div>
            <Switch checked={autoCard} onCheckedChange={setAutoCard} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button className="rounded-full" onClick={submit} disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentBadge({ expense }: { expense: SupplierExpense }) {
  const credit = expense.document_type === 'credit_note';
  const deliveryNote = expense.document_type === 'delivery_note';
  const reference = expense.document_type === 'invoice'
    ? expense.invoice_number || expense.document_number
    : expense.delivery_note_number || expense.document_number;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 first:mt-0">
      <Badge variant="outline" className={cn(
        'font-normal',
        credit && 'border-urgent/30 bg-urgent/10 text-urgent',
        deliveryNote && 'border-due/30 bg-due-soft text-due-foreground',
      )}>
        {documentLabels[expense.document_type]} {reference}
      </Badge>
      {expense.amount_basis === 'provisional' && <Badge variant="secondary" className="font-normal">Provisoire</Badge>}
      <span className="text-[11px] text-muted-foreground">{expense.item_count} ligne{expense.item_count > 1 ? 's' : ''}</span>
    </div>
  );
}

function AccountingStatus({ expense }: { expense: SupplierExpense }) {
  const status = expense.accounting_status;
  const label = status ? statusLabels[status] : expense.document_type === 'invoice' ? 'Facture importée' : 'Historique';
  return (
    <Badge variant="outline" className={cn(
      'whitespace-nowrap font-normal',
      status === 'paid' && 'border-done/30 bg-done-soft text-done',
      status === 'paid_card_invoice_pending' && 'border-done/30 bg-done-soft text-done',
      status === 'card_to_confirm' && 'border-due/40 bg-due-soft text-due-foreground',
      status === 'review_required' && 'border-urgent/30 bg-urgent-soft text-urgent',
      status === 'credited' && 'border-primary/20 bg-primary/5 text-primary',
    )}>
      {label}
    </Badge>
  );
}

function ExpenseDialog({
  expense,
  analyses,
  onOpenChange,
}: {
  expense: SupplierExpense | null;
  analyses: SupplierDocumentAnalysis[];
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const confirmPaymentMutation = useMutation({
    mutationFn: confirmSupplierExpensePayment,
    onSuccess: async (_result, paidExpense) => {
      toast.success(paidExpense.payment_method === 'card' ? 'Paiement par carte confirmé' : 'Règlement fournisseur confirmé');
      onOpenChange(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['supplier-expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['supplier-accounts-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] }),
      ]);
    },
    onError: (paymentError) => toast.error(paymentError instanceof Error ? paymentError.message : 'Confirmation impossible'),
  });

  const openDocument = async (analysis: SupplierDocumentAnalysis) => {
    setOpeningId(analysis.id);
    try {
      const blob = await fetchEmailAttachment({
        communicationId: analysis.communication_id,
        attachmentId: analysis.attachment_id,
      });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (openError) {
      toast.error(openError instanceof Error ? openError.message : 'Ouverture du PDF impossible');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Dialog open={Boolean(expense)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col overflow-hidden p-0">
        {expense && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4 pr-12">
              <DialogTitle>{documentLabels[expense.document_type]} {expense.invoice_number || expense.delivery_note_number || expense.document_number} · {expense.supplier}</DialogTitle>
              <DialogDescription>{dateFr(expense.invoice_date)} · {expense.sites || 'Site non précisé'}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Mini label="HT" value={euro.format(Number(expense.amount_ht))} />
                <Mini label="TVA" value={euro.format(Number(expense.vat_amount))} />
                <Mini label="TTC" value={euro.format(Number(expense.amount_ttc))} />
                <Mini label="Échéance" value={dateFr(expense.due_date)} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <AccountingStatus expense={expense} />
                <Badge variant="secondary" className="font-normal">
                  {expense.amount_basis === 'provisional' ? 'Montant provisoire du BL' : 'Montant final'}
                </Badge>
                {expense.payment_method === 'card' && (
                  <Badge variant="outline" className="border-due/30 bg-due-soft font-normal text-due-foreground">
                    <CreditCard className="mr-1 h-3 w-3" /> Carte bancaire
                  </Badge>
                )}
                {expense.analysis_confidence != null && (
                  <Badge variant="outline" className="font-normal">Lecture IA {numeric(expense.analysis_confidence)} %</Badge>
                )}
              </div>
              {(expense.payment_confirmation_required
                || expense.accounting_status === 'card_to_confirm'
                || (expense.document_type === 'invoice' && !['paid', 'refunded'].includes(expense.payment_status ?? ''))) && (
                <Alert className="mt-4 border-due/30 bg-due-soft/40">
                  <CreditCard className="h-4 w-4 text-due" />
                  <AlertTitle>{expense.accounting_status === 'card_to_confirm' ? 'Paiement CB à confirmer' : 'Règlement fournisseur à confirmer'}</AlertTitle>
                  <AlertDescription className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <span>Confirmez uniquement après avoir constaté le débit ou le règlement réel.</span>
                    <Button size="sm" className="rounded-full" onClick={() => confirmPaymentMutation.mutate(expense)} disabled={confirmPaymentMutation.isPending}>
                      {confirmPaymentMutation.isPending
                        ? 'Confirmation…'
                        : expense.accounting_status === 'card_to_confirm' ? 'Confirmer le paiement CB' : 'Marquer comme payé'}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {(expense.delivery_note_number || expense.invoice_number || expense.order_number) && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Mini label="Bon de livraison" value={expense.delivery_note_number || '—'} />
                  <Mini label="Facture fournisseur" value={expense.invoice_number || 'En attente'} />
                  <Mini label="Commande" value={expense.order_number || '—'} />
                </div>
              )}
              <div className="mt-5 rounded-xl border border-border">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">Articles et frais</p>
                  <p className="text-xs text-muted-foreground">{expense.item_count} ligne{expense.item_count > 1 ? 's' : ''} extraite{expense.item_count > 1 ? 's' : ''}</p>
                </div>
                {expense.items.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Le détail n’était pas proposé dans l’extraction fournisseur.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Article</TableHead><TableHead>Famille</TableHead><TableHead>Site</TableHead><TableHead className="text-right">Qté</TableHead><TableHead className="text-right">Montant HT</TableHead></TableRow></TableHeader>
                      <TableBody>{expense.items.map((item, index) => <ItemRow key={`${item.sku}-${index}`} item={item} />)}</TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-xl bg-muted/50 p-4 text-xs text-muted-foreground">
                <div className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium text-foreground">{expense.pdf_filename || 'PDF non référencé'}</p><p>{analyses.length > 0 ? 'Original conservé dans le CRM avec son analyse.' : expense.pdf_available_in_source ? 'Disponible sur le portail fournisseur, fichier non importé dans le CRM.' : 'PDF indisponible lors de l’extraction.'}</p></div></div>
              </div>
              {analyses.length > 0 && (
                <div className="mt-4 rounded-xl border border-border">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold">Documents d’origine</p>
                    <p className="text-xs text-muted-foreground">BL, facture et avoir restent séparés et téléchargeables.</p>
                  </div>
                  <div className="divide-y divide-border">
                    {analyses.map((analysis) => (
                      <div key={analysis.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{analysis.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {analysis.document_type === 'delivery_note' ? 'Bon de livraison' : analysis.document_type === 'credit_note' ? 'Avoir' : 'Facture'}
                            {analysis.confidence != null ? ` · confiance ${numeric(analysis.confidence)} %` : ''}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-full" onClick={() => void openDocument(analysis)} disabled={openingId === analysis.id}>
                          <FileText className="mr-1.5 h-3.5 w-3.5" /> {openingId === analysis.id ? 'Ouverture…' : 'Ouvrir le PDF'}
                        </Button>
                        {analysis.warnings.length > 0 && (
                          <p className="w-full text-xs text-urgent">{analysis.warnings.join(' · ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}

function ItemRow({ item }: { item: SupplierExpenseItem }) {
  return (
    <TableRow>
      <TableCell className="min-w-64"><p className="font-medium">{item.description || 'Sans désignation'}</p><p className="text-xs text-muted-foreground">{item.sku || 'Sans référence'}</p></TableCell>
      <TableCell>{item.category || '—'}</TableCell><TableCell>{item.site || '—'}</TableCell>
      <TableCell className="text-right tabular-nums">{item.quantity ?? '—'}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{montant(item.amount_ht)}</TableCell>
    </TableRow>
  );
}
