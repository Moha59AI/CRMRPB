import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle, FileText, PackageOpen, ReceiptText, RefreshCw, Search,
  ShoppingCart, Undo2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  fetchSupplierExpenses, type SupplierExpense, type SupplierExpenseItem,
} from './supplier-expenses-service';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const entier = new Intl.NumberFormat('fr-FR');
const dateCourte = new Intl.DateTimeFormat('fr-FR');

type TypeFiltre = 'all' | SupplierExpense['document_type'];

function dateFr(value: string | null) {
  if (!value) return '—';
  return dateCourte.format(new Date(`${value}T12:00:00`));
}

function montant(value: number | null) {
  return value == null ? '—' : euro.format(value);
}

function texteRecherche(expense: SupplierExpense) {
  return [
    expense.supplier, expense.document_number, expense.sites,
    ...expense.items.flatMap((item) => [item.sku, item.description, item.category, item.site]),
  ].filter(Boolean).join(' ').toLocaleLowerCase('fr');
}

export function SupplierExpensesPage() {
  const [supplier, setSupplier] = useState('all');
  const [type, setType] = useState<TypeFiltre>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SupplierExpense | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('fr'));
  const { data = [], isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['supplier-expenses'],
    queryFn: fetchSupplierExpenses,
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
    ht: result.ht + Number(expense.amount_ht),
    vat: result.vat + Number(expense.vat_amount),
    ttc: result.ttc + Number(expense.amount_ttc),
    invoices: result.invoices + (expense.document_type === 'invoice' ? 1 : 0),
    credits: result.credits + (expense.document_type === 'credit_note' ? 1 : 0),
  }), { ht: 0, vat: 0, ttc: 0, invoices: 0, credits: 0 }), [filtered]);

  return (
    <>
      <PageHeader
        title="Dépenses fournisseurs"
        description="Factures, avoirs et détail des achats VSF et Panther Pro"
        action={
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => void refetch()} disabled={isFetching} aria-label="Actualiser">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="gutter-x mx-auto max-w-[1500px] space-y-5 py-4 sm:py-6">
          {isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Les dépenses ne peuvent pas être chargées</AlertTitle>
              <AlertDescription>{error instanceof Error ? error.message : 'Erreur inconnue'}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={ShoppingCart} label="Net HT" value={euro.format(totals.ht)} detail={`${totals.invoices} factures`} />
            <Metric icon={ReceiptText} label="TVA nette" value={euro.format(totals.vat)} detail="Factures et avoirs" />
            <Metric icon={PackageOpen} label="Net TTC" value={euro.format(totals.ttc)} detail={`${entier.format(filtered.length)} documents`} />
            <Metric icon={Undo2} label="Avoirs" value={entier.format(totals.credits)} detail="Déduits des totaux" />
          </div>

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
                    <SelectItem value="all">Factures et avoirs</SelectItem>
                    <SelectItem value="invoice">Factures</SelectItem>
                    <SelectItem value="credit_note">Avoirs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
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
                        <TableHead>Sites</TableHead><TableHead className="text-right">HT</TableHead>
                        <TableHead className="text-right">TVA</TableHead><TableHead className="text-right">TTC</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((expense) => (
                        <TableRow key={expense.id} className="cursor-pointer" onClick={() => setSelected(expense)}>
                          <TableCell className="whitespace-nowrap">{dateFr(expense.invoice_date)}</TableCell>
                          <TableCell className="font-medium">{expense.supplier}</TableCell>
                          <TableCell><DocumentBadge expense={expense} /></TableCell>
                          <TableCell className="max-w-52 truncate text-muted-foreground">{expense.sites || 'Non précisé'}</TableCell>
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
            Import du 08/10/2026. Le classeur référence 176 PDF disponibles chez les fournisseurs, mais les fichiers PDF ne sont pas inclus dans cet import.
          </p>
        </div>
      </div>

      <ExpenseDialog expense={selected} onOpenChange={(open) => !open && setSelected(null)} />
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

function DocumentBadge({ expense }: { expense: SupplierExpense }) {
  const credit = expense.document_type === 'credit_note';
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 first:mt-0">
      <Badge variant="outline" className={cn('font-normal', credit && 'border-urgent/30 bg-urgent/10 text-urgent')}>
        {credit ? 'Avoir' : 'Facture'} {expense.document_number}
      </Badge>
      <span className="text-[11px] text-muted-foreground">{expense.item_count} ligne{expense.item_count > 1 ? 's' : ''}</span>
    </div>
  );
}

function ExpenseDialog({ expense, onOpenChange }: { expense: SupplierExpense | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(expense)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col overflow-hidden p-0">
        {expense && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4 pr-12">
              <DialogTitle>{expense.document_type === 'credit_note' ? 'Avoir' : 'Facture'} {expense.document_number} · {expense.supplier}</DialogTitle>
              <DialogDescription>{dateFr(expense.invoice_date)} · {expense.sites || 'Site non précisé'}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Mini label="HT" value={euro.format(Number(expense.amount_ht))} />
                <Mini label="TVA" value={euro.format(Number(expense.vat_amount))} />
                <Mini label="TTC" value={euro.format(Number(expense.amount_ttc))} />
                <Mini label="Échéance" value={dateFr(expense.due_date)} />
              </div>
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
                <div className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium text-foreground">{expense.pdf_filename || 'PDF non référencé'}</p><p>{expense.pdf_available_in_source ? 'Disponible sur le portail fournisseur, fichier non importé dans le CRM.' : 'PDF indisponible lors de l’extraction.'}</p></div></div>
              </div>
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
