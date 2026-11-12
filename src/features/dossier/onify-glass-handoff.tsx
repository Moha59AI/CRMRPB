import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, ExternalLink, FileClock, Loader2, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { messageErreurBase } from '@/lib/erreurs';
import { fetchOnifyGlassCaseByLeadId } from '@/services/cases-service';
import { fetchClientDocumentRequests } from '@/services/client-documents-service';
import { syncOnify } from '@/features/integrations/onify/onify-service';
import type { Lead } from '@/types';

const ONIFY_GLASS_URL = 'https://app.onify.fr/glass/edition';

/**
 * Enrichissement de la fiche Lead par le dossier Onify.
 *
 * L'API partenaire Glass est en lecture seule. Le CRM ouvre donc l'ecran
 * officiel de creation, puis recopie les informations utiles sur cette meme
 * fiche uniquement quand un dossier Onify reel est retrouve.
 */
export function OnifyLeadEnrichment({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const request = useQuery({
    queryKey: ['client-document-requests-onify', lead.id],
    queryFn: () => fetchClientDocumentRequests(lead.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const glassCase = useQuery({
    queryKey: ['onify-glass-case', lead.id],
    queryFn: () => fetchOnifyGlassCaseByLeadId(lead.id),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const sync = useMutation({
    mutationFn: syncOnify,
    onSuccess: async (counts) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['onify-glass-case', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['lead', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['cases'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['resumes-clients'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-notes', lead.id] }),
      ]);
      toast.success(
        counts.glassTransitions > 0
          ? 'Dossier Onify détecté : la fiche Lead a été enrichie'
          : 'Synchronisation Onify terminée',
      );
    },
    onError: (error: Error) => toast.error(messageErreurBase(error.message)),
  });

  const onifyCase = glassCase.data ?? null;
  // Un nouveau lien peut etre cree pour une piece complementaire. Une demande
  // anterieure complete prouve toujours que le socle obligatoire a ete recu.
  const documentsComplets = (request.data ?? []).some((item) => item.status === 'complete');
  const chargement = request.isLoading || glassCase.isLoading;
  const erreur = request.isError || glassCase.isError;

  if (chargement) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Vérification du passage vers Onify…
        </div>
      </section>
    );
  }

  if (erreur) {
    return (
      <section className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">Suivi Onify indisponible</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 rounded-full"
          onClick={() => { request.refetch(); glassCase.refetch(); }}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Réessayer
        </Button>
      </section>
    );
  }

  if (onifyCase) {
    const reference = onifyCase.onify_reference || onifyCase.case_number;
    const statut = onifyCase.onify_work_status_label
      || onifyCase.onify_status_label
      || lead.onify_stage
      || 'Synchronisé';
    const franchise = onifyCase.franchise_amount == null
      ? 'Non renseignée'
      : `${Number(onifyCase.franchise_amount).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${onifyCase.franchise_type === 'percent' ? '%' : '€'}`;
    return (
      <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Fiche enrichie par Onify</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Référence {reference}
              {statut ? ` — ${statut}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Le dossier Onify et le lead restent une seule fiche dans le CRM.
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-primary/15 bg-card/70 p-3 text-xs">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Assurance</dt>
            <dd className="truncate font-medium text-foreground">
              {onifyCase.insurance_name || onifyCase.onify_insurer_name || lead.insurance || '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Franchise</dt>
            <dd className="truncate font-medium text-foreground">{franchise}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Sinistre</dt>
            <dd className="truncate font-medium text-foreground">
              {onifyCase.insurance_claim_number || lead.insurance_claim_number || '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Paiement</dt>
            <dd className="truncate font-medium text-foreground">
              {onifyCase.onify_payment_status || '—'}
            </dd>
          </div>
        </dl>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => window.open(ONIFY_GLASS_URL, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Ouvrir Onify
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Actualiser Onify
          </Button>
        </div>
      </section>
    );
  }

  if (documentsComplets) {
    return (
      <section className="rounded-xl border border-emerald-300/70 bg-emerald-50/80 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Prêt pour Onify</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Les pièces obligatoires sont reçues. Créez le dossier dans Onify,
              puis synchronisez : cette fiche Lead sera complétée automatiquement.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => window.open(ONIFY_GLASS_URL, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Créer dans Onify
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Synchroniser
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Le contrôle automatique tourne aussi régulièrement : la fiche n’est enrichie qu’après détection d’un vrai dossier Onify.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileClock className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">En attente du dossier Onify</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            La même fiche restera dans Leads. Elle passera à « Prêt Onify » quand les pièces obligatoires seront reçues, puis sera enrichie après la création du dossier.
          </p>
        </div>
      </div>
    </section>
  );
}
