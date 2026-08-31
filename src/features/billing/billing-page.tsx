import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Plus, FileText, CreditCard, Gift as GiftIcon, AlertCircle, Euro,
  CheckCircle2, Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type {
  Invoice, WindscreenCase, Contact,
  InvoiceStatus, QuoteStatus, GiftStatus,
} from '@/types';
import { createInvoice, fetchGifts, fetchInvoices, fetchPayments, fetchQuotes } from '@/services/billing-service';
import { fetchCases } from '@/services/cases-service';
import { fetchContacts } from '@/services/contacts-service';

// ============ CONSTANTS ============

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  partial: 'Partielle',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

function invoiceStatusColor(status: InvoiceStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-50 text-gray-700 border-gray-200';
    case 'sent':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'paid':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'partial':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'overdue':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'cancelled':
      return 'bg-gray-50 text-gray-500 border-gray-200 line-through';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

const quoteStatusLabels: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  expired: 'Expiré',
};

function quoteStatusColor(status: QuoteStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-50 text-gray-700 border-gray-200';
    case 'sent':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'accepted':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'rejected':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'expired':
      return 'bg-gray-50 text-gray-500 border-gray-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

const giftStatusLabels: Record<GiftStatus, string> = {
  pending: 'En attente',
  ordered: 'Commandé',
  given: 'Remis',
  cancelled: 'Annulé',
};

function giftStatusColor(status: GiftStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-gray-50 text-gray-700 border-gray-200';
    case 'ordered':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'given':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'cancelled':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

const paymentMethodLabels: Record<string, string> = {
  transfer: 'Virement',
  check: 'Chèque',
  cash: 'Espèces',
  card: 'Carte',
  other: 'Autre',
};

const euroFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
function formatEuro(amount: number | null | undefined): string {
  if (amount == null || amount === 0) return '—';
  return euroFormat.format(amount);
}
function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ============ MAIN PAGE ============

export function BillingPage() {
  const [tab, setTab] = useState('invoices');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: invoices, isLoading: invoicesLoading, isError: invoicesError, error: invoicesErr, refetch: refetchInvoices } = useQuery({
    queryKey: ['invoices', 'all'],
    queryFn: () => fetchInvoices({}),
  });

  const { data: quotes, isLoading: quotesLoading, isError: quotesError, error: quotesErr, refetch: refetchQuotes } = useQuery({
    queryKey: ['quotes'],
    queryFn: fetchQuotes,
  });

  const { data: payments, isLoading: paymentsLoading, isError: paymentsError, error: paymentsErr, refetch: refetchPayments } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetchPayments(),
  });

  const { data: gifts, isLoading: giftsLoading, isError: giftsError, error: giftsErr, refetch: refetchGifts } = useQuery({
    queryKey: ['gifts', 'all'],
    queryFn: () => fetchGifts({}),
  });

  const { data: cases } = useQuery({ queryKey: ['cases-all-billing'], queryFn: () => fetchCases({}) });
  const { data: contacts } = useQuery({ queryKey: ['contacts-all-billing'], queryFn: () => fetchContacts({}) });

  const caseMap = useMemo(() => {
    const m = new Map<string, WindscreenCase>();
    (cases ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [cases]);

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>();
    (contacts ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [contacts]);

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice>();
    (invoices ?? []).forEach((i) => m.set(i.id, i));
    return m;
  }, [invoices]);

  // Overdue invoices: status='overdue' OR (status='sent' and due_date < now)
  const overdueInvoices = useMemo(() => {
    const now = new Date();
    return (invoices ?? []).filter((inv) => {
      if (inv.status === 'overdue') return true;
      if (inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < now) return true;
      return false;
    });
  }, [invoices]);

  const contactNameFor = (id: string | null): string => {
    if (!id) return '—';
    const c = contactMap.get(id);
    return c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : '—';
  };

  const caseNumberFor = (id: string | null): string => {
    if (!id) return '—';
    return caseMap.get(id)?.case_number ?? '—';
  };

  const invoiceNumberFor = (id: string | null): string => {
    if (!id) return '—';
    return invoiceMap.get(id)?.invoice_number ?? '—';
  };

  return (
    <>
      <PageHeader
        title="Facturation"
        description="Factures, devis et paiements"
        action={
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle facture
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-6 py-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="rounded-lg">
              <TabsTrigger value="invoices" className="rounded-md">
                <Receipt className="mr-1.5 h-3.5 w-3.5" />
                Factures
              </TabsTrigger>
              <TabsTrigger value="quotes" className="rounded-md">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Devis
              </TabsTrigger>
              <TabsTrigger value="payments" className="rounded-md">
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                Paiements
              </TabsTrigger>
              <TabsTrigger value="gifts" className="rounded-md">
                <GiftIcon className="mr-1.5 h-3.5 w-3.5" />
                Cadeaux
              </TabsTrigger>
              <TabsTrigger value="overdue" className="rounded-md">
                <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
                Factures en retard
              </TabsTrigger>
            </TabsList>

            {/* ===== FACTURES ===== */}
            <TabsContent value="invoices" className="mt-4">
              <div className="rounded-xl border border-border bg-white">
                {invoicesLoading && <TableSkeleton rows={6} cols={11} />}
                {invoicesError && (
                  <ErrorState message={(invoicesErr as Error)?.message} onRetry={refetchInvoices} />
                )}
                {!invoicesLoading && !invoicesError && invoices && invoices.length === 0 && (
                  <EmptyState
                    icon={<Receipt className="h-7 w-7" strokeWidth={1.5} />}
                    title="Aucune facture pour le moment"
                    description="Créez votre première facture pour suivre vos encaissements et votre comptabilité."
                    action={
                      <Button className="mt-4 rounded-full" onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nouvelle facture
                      </Button>
                    }
                  />
                )}
                {!invoicesLoading && !invoicesError && invoices && invoices.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">N° Facture</TableHead>
                        <TableHead className="text-xs">Dossier</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs text-right">Montant HT</TableHead>
                        <TableHead className="text-xs text-right">TVA</TableHead>
                        <TableHead className="text-xs text-right">Montant TTC</TableHead>
                        <TableHead className="text-xs text-right">Assurance</TableHead>
                        <TableHead className="text-xs text-right">Franchise</TableHead>
                        <TableHead className="text-xs text-right">Reste à recevoir</TableHead>
                        <TableHead className="text-xs">Échéance</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-foreground text-sm">{inv.invoice_number}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{caseNumberFor(inv.case_id)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{contactNameFor(inv.contact_id)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatEuro(inv.amount_ht)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                            {inv.tva_rate ? `${inv.tva_rate}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{formatEuro(inv.amount_ttc)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatEuro(inv.insurance_amount)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatEuro(inv.franchise_amount)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatEuro(inv.remaining_amount)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.due_date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`rounded-full text-[10px] ${invoiceStatusColor(inv.status)}`}>
                              {invoiceStatusLabels[inv.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>

            {/* ===== DEVIS ===== */}
            <TabsContent value="quotes" className="mt-4">
              <div className="rounded-xl border border-border bg-white">
                {quotesLoading && <TableSkeleton rows={6} cols={6} />}
                {quotesError && (
                  <ErrorState message={(quotesErr as Error)?.message} onRetry={refetchQuotes} />
                )}
                {!quotesLoading && !quotesError && quotes && quotes.length === 0 && (
                  <EmptyState
                    icon={<FileText className="h-7 w-7" strokeWidth={1.5} />}
                    title="Aucun devis pour le moment"
                    description="Les devis envoyés à vos clients et assurances apparaîtront ici."
                  />
                )}
                {!quotesLoading && !quotesError && quotes && quotes.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">N° Devis</TableHead>
                        <TableHead className="text-xs">Dossier</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs text-right">Montant HT</TableHead>
                        <TableHead className="text-xs text-right">Montant TTC</TableHead>
                        <TableHead className="text-xs text-right">Franchise</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium text-foreground text-sm">{q.quote_number}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{caseNumberFor(q.case_id)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{contactNameFor(q.contact_id)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatEuro(q.amount_ht)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{formatEuro(q.amount_ttc)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatEuro(q.franchise_amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`rounded-full text-[10px] ${quoteStatusColor(q.status)}`}>
                              {quoteStatusLabels[q.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>

            {/* ===== PAIEMENTS ===== */}
            <TabsContent value="payments" className="mt-4">
              <div className="rounded-xl border border-border bg-white">
                {paymentsLoading && <TableSkeleton rows={6} cols={5} />}
                {paymentsError && (
                  <ErrorState message={(paymentsErr as Error)?.message} onRetry={refetchPayments} />
                )}
                {!paymentsLoading && !paymentsError && payments && payments.length === 0 && (
                  <EmptyState
                    icon={<CreditCard className="h-7 w-7" strokeWidth={1.5} />}
                    title="Aucun paiement enregistré"
                    description="Les paiements encaissés sur vos factures apparaîtront ici."
                  />
                )}
                {!paymentsLoading && !paymentsError && payments && payments.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Facture</TableHead>
                        <TableHead className="text-xs text-right">Montant</TableHead>
                        <TableHead className="text-xs">Méthode</TableHead>
                        <TableHead className="text-xs">Référence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(p.payment_date)}</TableCell>
                          <TableCell className="text-sm text-foreground">
                            {p.invoice_id ? invoiceNumberFor(p.invoice_id) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{formatEuro(p.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              {paymentMethodLabels[p.payment_method] ?? p.payment_method}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.reference || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>

            {/* ===== CADEAUX ===== */}
            <TabsContent value="gifts" className="mt-4">
              <div className="rounded-xl border border-border bg-white">
                {giftsLoading && <TableSkeleton rows={6} cols={6} />}
                {giftsError && (
                  <ErrorState message={(giftsErr as Error)?.message} onRetry={refetchGifts} />
                )}
                {!giftsLoading && !giftsError && gifts && gifts.length === 0 && (
                  <EmptyState
                    icon={<GiftIcon className="h-7 w-7" strokeWidth={1.5} />}
                    title="Aucun cadeau pour le moment"
                    description="Les cadeaux remis à vos clients suite à une intervention apparaîtront ici."
                  />
                )}
                {!giftsLoading && !giftsError && gifts && gifts.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Dossier</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs text-right">Montant</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                        <TableHead className="text-xs">Remis le</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gifts.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="text-sm text-muted-foreground">{caseNumberFor(g.case_id)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              {g.type === 'gift' ? 'Cadeau' : 'Transfert'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{g.description || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatEuro(g.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`rounded-full text-[10px] ${giftStatusColor(g.status)}`}>
                              {giftStatusLabels[g.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(g.given_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>

            {/* ===== FACTURES EN RETARD ===== */}
            <TabsContent value="overdue" className="mt-4">
              <div className="rounded-xl border border-border bg-white">
                {!invoicesLoading && overdueInvoices.length === 0 && (
                  <EmptyState
                    icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" strokeWidth={1.5} />}
                    title="Aucune facture en retard"
                    description="Toutes vos factures sont à jour. Félicitations !"
                  />
                )}
                {!invoicesLoading && overdueInvoices.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 border-b border-border bg-red-50/50 px-4 py-3">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <p className="text-sm text-red-700">
                        {overdueInvoices.length} facture{overdueInvoices.length > 1 ? 's' : ''} en retard de paiement
                      </p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">N° Facture</TableHead>
                          <TableHead className="text-xs">Dossier</TableHead>
                          <TableHead className="text-xs">Client</TableHead>
                          <TableHead className="text-xs text-right">Montant TTC</TableHead>
                          <TableHead className="text-xs text-right">Reste à recevoir</TableHead>
                          <TableHead className="text-xs">Échéance</TableHead>
                          <TableHead className="text-xs">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overdueInvoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-medium text-foreground text-sm">{inv.invoice_number}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{caseNumberFor(inv.case_id)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{contactNameFor(inv.contact_id)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{formatEuro(inv.amount_ttc)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-red-700">{formatEuro(inv.remaining_amount)}</TableCell>
                            <TableCell className="text-sm text-red-700">{formatDate(inv.due_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="rounded-full text-[10px] bg-red-50 text-red-700 border-red-200">
                                {invoiceStatusLabels[inv.status]}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Create invoice dialog */}
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        cases={cases ?? []}
        contacts={contacts ?? []}
        existingInvoices={invoices ?? []}
      />
    </>
  );
}

// ============ CREATE INVOICE DIALOG ============

const invoiceSchema = z.object({
  case_id: z.string().optional().or(z.literal('')),
  contact_id: z.string().optional().or(z.literal('')),
  amount_ht: z.string().min(1, 'Le montant HT est requis'),
  tva_rate: z.string().min(1, 'Le taux de TVA est requis'),
  franchise_amount: z.string().optional().or(z.literal('')),
  insurance_amount: z.string().optional().or(z.literal('')),
  gift_amount: z.string().optional().or(z.literal('')),
  due_date: z.string().optional().or(z.literal('')),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

function generateInvoiceNumber(existing: Invoice[]): string {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;
  // Find the max sequence number for this year
  const nums = existing
    .map((i) => {
      const m = i.invoice_number?.match(/^FAC-\d{4}-(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

function CreateInvoiceDialog({
  open, onOpenChange, cases, contacts, existingInvoices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cases: WindscreenCase[];
  contacts: Contact[];
  existingInvoices: Invoice[];
}) {
  const queryClient = useQueryClient();
  const [caseId, setCaseId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [tvaRate, setTvaRate] = useState<string>('20');

  const generatedInvoiceNumber = useMemo(
    () => generateInvoiceNumber(existingInvoices),
    [existingInvoices],
  );

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      case_id: '',
      contact_id: '',
      amount_ht: '',
      tva_rate: '20',
      franchise_amount: '',
      insurance_amount: '',
      gift_amount: '',
      due_date: '',
    },
  });

  const amountHt = form.watch('amount_ht');
  const tvaRateWatched = form.watch('tva_rate');

  // Auto-calc amount_ttc = amount_ht * (1 + tva_rate/100)
  const amountTtc = useMemo(() => {
    const ht = parseFloat(amountHt);
    const tva = parseFloat(tvaRateWatched);
    if (isNaN(ht) || isNaN(tva)) return 0;
    return ht * (1 + tva / 100);
  }, [amountHt, tvaRateWatched]);

  const mutation = useMutation({
    mutationFn: (values: InvoiceFormValues) => {
      const ht = parseFloat(values.amount_ht) || 0;
      const tva = parseFloat(values.tva_rate) || 0;
      const ttc = ht * (1 + tva / 100);
      const franchise = parseFloat(values.franchise_amount || '') || 0;
      const insurance = parseFloat(values.insurance_amount || '') || 0;
      const gift = parseFloat(values.gift_amount || '') || 0;
      return createInvoice({
        invoice_number: generatedInvoiceNumber,
        case_id: values.case_id || null,
        contact_id: values.contact_id || null,
        amount_ht: ht,
        tva_rate: tva,
        amount_ttc: ttc,
        franchise_amount: franchise,
        insurance_amount: insurance,
        gift_amount: gift,
        estimated_margin: 0,
        amount_paid: 0,
        remaining_amount: ttc,
        issue_date: new Date().toISOString(),
        due_date: values.due_date ? new Date(values.due_date).toISOString() : null,
        payment_date: null,
        status: 'draft',
      });
    },
    onSuccess: (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Facture créée', {
        description: `${generatedInvoiceNumber} enregistrée comme brouillon.`,
      });
      resetAndClose();
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de création'),
  });

  const resetAndClose = () => {
    form.reset();
    setCaseId('');
    setContactId('');
    setTvaRate('20');
    onOpenChange(false);
  };

  const onSubmit = (values: InvoiceFormValues) => mutation.mutate(values);

  const handleCaseChange = (v: string) => {
    setCaseId(v);
    form.setValue('case_id', v);
    // Auto-fill contact from the case if present
    const c = cases.find((cs) => cs.id === v);
    if (c?.contact_id) {
      setContactId(c.contact_id);
      form.setValue('contact_id', c.contact_id);
    }
  };

  const handleContactChange = (v: string) => {
    setContactId(v);
    form.setValue('contact_id', v);
  };

  const handleTvaChange = (v: string) => {
    setTvaRate(v);
    form.setValue('tva_rate', v);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle facture</DialogTitle>
          <DialogDescription>
            Créez une facture. Le montant TTC est calculé automatiquement à partir du HT et de la TVA.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Auto-generated invoice number (read-only display) */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">N° de facture</Label>
            <div className="flex h-9 items-center rounded-lg border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
              {generatedInvoiceNumber}
              <span className="ml-auto text-xs">(auto-généré)</span>
            </div>
          </div>

          {/* Case (optional) */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Dossier (optionnel)</Label>
            <Select value={caseId} onValueChange={handleCaseChange}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Aucun dossier" />
              </SelectTrigger>
              <SelectContent>
                {cases.length === 0 && (
                  <SelectItem value="_none" disabled>Aucun dossier disponible</SelectItem>
                )}
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.case_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contact (optional) */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Client (optionnel)</Label>
            <Select value={contactId} onValueChange={handleContactChange}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Aucun client" />
              </SelectTrigger>
              <SelectContent>
                {contacts.length === 0 && (
                  <SelectItem value="_none" disabled>Aucun contact disponible</SelectItem>
                )}
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Montant HT (€)"
              type="number"
              step="0.01"
              error={form.formState.errors.amount_ht?.message}
              {...form.register('amount_ht')}
              placeholder="0,00"
            />
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">Taux TVA (%)</Label>
              <Select value={tvaRate} onValueChange={handleTvaChange}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="5.5">5,5%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                  <SelectItem value="20">20%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Calculated TTC */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <Euro className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Montant TTC</span>
            </div>
            <span className="text-base font-semibold text-foreground tabular-nums">
              {amountTtc > 0 ? formatEuro(amountTtc) : '—'}
            </span>
          </div>

          {/* Franchise / Insurance / Gift */}
          <div className="grid grid-cols-3 gap-3">
            <FormField
              label="Franchise (€)"
              type="number"
              step="0.01"
              {...form.register('franchise_amount')}
              placeholder="0,00"
            />
            <FormField
              label="Assurance (€)"
              type="number"
              step="0.01"
              {...form.register('insurance_amount')}
              placeholder="0,00"
            />
            <FormField
              label="Cadeau (€)"
              type="number"
              step="0.01"
              {...form.register('gift_amount')}
              placeholder="0,00"
            />
          </div>

          {/* Due date */}
          <FormField
            label="Date d'échéance"
            type="date"
            error={form.formState.errors.due_date?.message}
            {...form.register('due_date')}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Créer la facture
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ SMALL COMPONENTS ============

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="p-4">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
      {/* cols referenced to avoid unused warning */}
      <span className="sr-only">{cols}</span>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message || 'Erreur de chargement'}</p>
      <Button variant="outline" className="mt-4 rounded-full" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  );
}

function EmptyState({
  icon, title, description, action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

function FormField({
  label, error, ...props
}: {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-foreground">{label}</Label>
      <Input
        {...props}
        className={`rounded-lg ${props.className ?? ''}`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
