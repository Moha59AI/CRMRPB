import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, Search, ShieldCheck, ShoppingCart, Unlink, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  confirmSupplierMatch,
  countLinkableSupplierLines,
  fetchFinancialConnections,
  removeSupplierMatch,
  type SupplierMatchCandidate,
} from './financial-connections-service';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const integer = new Intl.NumberFormat('fr-FR');
const date = new Intl.DateTimeFormat('fr-FR');

function dateFr(value: string) {
  return date.format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function itemKey(candidate: SupplierMatchCandidate) {
  return `${candidate.supplier_expense_id}:${candidate.supplier_item_index}`;
}

export function FinancialConnectionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('fr'));
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['financial-connections'],
    queryFn: fetchFinancialConnections,
  });

  const confirmMutation = useMutation({
    mutationFn: confirmSupplierMatch,
    onSuccess: async () => {
      toast.success('Achat fournisseur rattaché à la facture');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['financial-connections'] }),
        queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['marketing-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['supplier-expenses'] }),
      ]);
    },
    onError: (mutationError) => toast.error(mutationError instanceof Error ? mutationError.message : 'Rapprochement impossible'),
  });

  const removeMutation = useMutation({
    mutationFn: removeSupplierMatch,
    onSuccess: async () => {
      toast.success('Rapprochement retiré');
      await queryClient.invalidateQueries({ queryKey: ['financial-connections'] });
    },
    onError: (mutationError) => toast.error(mutationError instanceof Error ? mutationError.message : 'Suppression impossible'),
  });

  const view = useMemo(() => {
    if (!data) return null;
    const candidateItems = new Set(data.candidates.map(itemKey));
    const uniqueCandidates = new Set(data.candidates.filter((item) => item.candidate_count === 1).map(itemKey));
    const linkableLines = countLinkableSupplierLines(data.supplierExpenses);
    const invoiceContacts = data.profitability.filter((item) => item.contact_id).length;
    const profitableInvoices = data.profitability.filter((item) => item.supplier_cost_known).length;
    const linkedCost = data.allocations.reduce((total, item) => total + Number(item.amount_ht), 0);
    const filtered = data.candidates.filter((candidate) => {
      if (!deferredSearch) return true;
      return [candidate.sku, candidate.supplier_description, candidate.document_number,
        candidate.invoice_number, candidate.customer_name, candidate.supplier]
        .filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(deferredSearch);
    });
    return {
      ...data,
      filtered,
      candidateItemCount: candidateItems.size,
      uniqueCandidateCount: uniqueCandidates.size,
      linkableLines,
      invoiceContacts,
      profitableInvoices,
      linkedCost,
    };
  }, [data, deferredSearch]);

  return (
    <>
      <PageHeader
        title="Interconnexions financières"
        description="Reliez les achats fournisseurs aux factures pour alimenter automatiquement la rentabilité"
        action={
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => void refetch()} disabled={isFetching} aria-label="Actualiser">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="gutter-x mx-auto max-w-[1500px] space-y-5 py-4 sm:py-6">
          {isLoading && <Card className="p-10 text-center text-sm text-muted-foreground">Analyse des correspondances…</Card>}
          {isError && (
            <Alert variant="destructive">
              <Link2 className="h-4 w-4" />
              <AlertTitle>Interconnexion indisponible</AlertTitle>
              <AlertDescription>{error instanceof Error ? error.message : 'Erreur inconnue'}</AlertDescription>
            </Alert>
          )}

          {view && (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Metric icon={UsersRound} label="Factures avec client" value={`${integer.format(view.invoiceContacts)} / ${integer.format(view.profitability.length)}`} detail="Facturation → fiche client" />
                <Metric icon={ShoppingCart} label="Achats rapprochés" value={`${integer.format(view.allocations.length)} / ${integer.format(view.linkableLines)}`} detail={`${euro.format(view.linkedCost)} HT attribués`} />
                <Metric icon={ShieldCheck} label="Suggestions sûres" value={integer.format(view.uniqueCandidateCount)} detail="Référence unique à valider" tone="success" />
                <Metric icon={Link2} label="Marges calculables" value={integer.format(view.profitableInvoices)} detail="Factures avec coût fournisseur" tone="success" />
              </div>

              <Alert className="border-primary/20 bg-primary/5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <AlertTitle>Contrôle avant alimentation des autres modules</AlertTitle>
                <AlertDescription>
                  Une validation relie l’achat à la facture, au client et au dossier lorsqu’il existe. Finance et Marketing peuvent alors lire la marge réelle. Les références ambiguës ne sont jamais choisies automatiquement.
                </AlertDescription>
              </Alert>

              <Card className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Rapprochements à contrôler</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{integer.format(view.candidateItemCount)} achat{view.candidateItemCount > 1 ? 's' : ''} avec au moins une facture candidate</p>
                  </div>
                  <div className="relative w-full lg:w-80">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Référence, client, facture…" className="pl-9" />
                  </div>
                </div>

                {view.filtered.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">Aucun rapprochement ne correspond à la recherche.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Achat fournisseur</TableHead><TableHead>Facture client</TableHead>
                          <TableHead>Écart</TableHead><TableHead>Confiance</TableHead><TableHead className="text-right">Coût HT</TableHead><TableHead className="w-28" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {view.filtered.map((candidate) => (
                          <TableRow key={`${itemKey(candidate)}:${candidate.invoice_id}`}>
                            <TableCell>
                              <p className="font-medium">{candidate.sku}</p>
                              <p className="max-w-72 truncate text-xs text-muted-foreground">{candidate.supplier} · {candidate.document_number} · {dateFr(candidate.item_date)}</p>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{candidate.customer_name || 'Client non identifié'}</p>
                              <p className="text-xs text-muted-foreground">{candidate.invoice_number} · {dateFr(candidate.invoice_date)}</p>
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">{candidate.date_gap_days} j</TableCell>
                            <TableCell><ConfidenceBadge candidate={candidate} /></TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{euro.format(Number(candidate.supplier_amount_ht))}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" className="rounded-full" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate(candidate)}>
                                Rattacher
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-border p-4">
                  <h2 className="text-sm font-semibold">Rapprochements validés</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Ces coûts alimentent la rentabilité consolidée par facture.</p>
                </div>
                {view.allocations.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">Aucun rapprochement validé pour le moment.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {view.allocations.slice(0, 50).map((allocation) => {
                      const expense = view.supplierExpenses.find((item) => item.id === allocation.supplier_expense_id);
                      const invoice = view.profitability.find((item) => item.invoice_id === allocation.invoice_id);
                      const item = expense?.items[allocation.supplier_item_index];
                      return (
                        <div key={allocation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item?.sku || 'Article'} · {invoice?.customer_name || 'Client non identifié'}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{expense?.supplier} {expense?.document_number} → facture {invoice?.invoice_number || allocation.invoice_id}</p>
                          </div>
                          <p className="font-medium tabular-nums">{euro.format(Number(allocation.amount_ht))}</p>
                          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(allocation.id)}>
                            <Unlink className="mr-2 h-4 w-4" />Détacher
                          </Button>
                        </div>
                      );
                    })}
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

function Metric({ icon: Icon, label, value, detail, tone = 'neutral' }: {
  icon: typeof Link2;
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'success';
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-xl', tone === 'success' ? 'bg-done/10 text-done' : 'bg-primary/10 text-primary')}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </Card>
  );
}

function ConfidenceBadge({ candidate }: { candidate: SupplierMatchCandidate }) {
  if (candidate.candidate_count === 1) {
    return <Badge className="border-done/20 bg-done/10 text-done hover:bg-done/10">Unique · {candidate.confidence}%</Badge>;
  }
  return <Badge variant="outline" className="border-due/30 bg-due/10 text-due">{candidate.candidate_count} choix · {candidate.confidence}%</Badge>;
}
