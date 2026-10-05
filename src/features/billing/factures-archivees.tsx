// Les factures conservées dans le CRM
//
// Le PDF d'une facture Onify est telecharge par la synchronisation et range
// dans un bucket prive du projet : 145 fichiers, 75 Mo, chez nous. Il ne
// depend plus d'Onify une fois arrive -- si leur service change ou disparait,
// les documents restent.
//
// Rien ne le montrait. Les factures n'etaient accessibles que depuis l'onglet
// Facturation, ou elles ont l'air d'etre allees chercher ailleurs. Cet onglet
// dit ce qui est garde, et depuis quand.

import { useQuery } from '@tanstack/react-query';
import { FileText, HardDrive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchFacturationClient } from '@/services/billing-service';
import { usePdfFacture } from './bouton-pdf-facture';
import type { Invoice } from '@/types';

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function jour(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function LigneArchivee({ facture }: { facture: Invoice }) {
  const { ouvrir, enCours, visionneuse } = usePdfFacture(facture);

  return (
    <li>
      <button
        type="button"
        onClick={() => void ouvrir()}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground"
        >
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {facture.invoice_number}.pdf
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            Émise le {jour(facture.issue_date)}
            {facture.onify_pdf_synced_at && ` · conservée depuis le ${jour(facture.onify_pdf_synced_at)}`}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {euros.format(facture.amount_ttc ?? 0)}
        </span>
        {enCours
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          : <Button size="sm" variant="outline" className="pointer-events-none rounded-full">Ouvrir</Button>}
      </button>
      {visionneuse}
    </li>
  );
}

export function FacturesArchivees({ contactId }: { contactId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-facturation', contactId],
    queryFn: () => fetchFacturationClient(contactId),
    enabled: !!contactId,
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;

  const archivees = (data?.factures ?? []).filter((f) => f.onify_pdf_path);
  if (archivees.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <HardDrive className="h-3.5 w-3.5" aria-hidden />
        Factures conservées dans le CRM
        <span className="ml-auto normal-case tabular-nums text-faint">
          {archivees.length} fichier{archivees.length > 1 ? 's' : ''}
        </span>
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {archivees.map((facture) => <LigneArchivee key={facture.id} facture={facture} />)}
      </ul>
    </section>
  );
}
