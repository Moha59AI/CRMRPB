import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, ExternalLink, FileClock, Loader2, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { messageErreurBase } from '@/lib/erreurs';
import { fetchOnifyGlassCaseByLeadId } from '@/services/cases-service';
import { fetchClientDocumentRequests } from '@/services/client-documents-service';
import { syncOnify } from '@/features/integrations/onify/onify-service';
import type { Lead } from '@/types';

const ONIFY_GLASS_URL = 'https://app.onify.fr/glass/edition';

/**
 * Passage controle entre le prospect CRM et le dossier Glass Onify.
 *
 * L'API partenaire Glass est en lecture seule. Le CRM ouvre donc l'ecran
 * officiel de creation, puis confirme le passage seulement quand la
 * synchronisation retrouve un dossier Onify reel rattache a ce lead.
 */
export function OnifyGlassHandoff({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
          ? 'Dossier Onify détecté : l’affaire a été transférée dans Glass'
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
    return (
      <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Dossier Onify créé</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Référence {reference}
              {onifyCase.onify_status_label ? ` — ${onifyCase.onify_status_label}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cette affaire continue maintenant dans Glass, avec le même contact.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => navigate(`/glass?id=${onifyCase.id}`)}
          >
            Voir dans Glass
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => window.open(ONIFY_GLASS_URL, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Ouvrir Onify
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
              Les pièces obligatoires sont reçues. Créez le dossier Glass dans Onify,
              puis lancez la synchronisation pour l’attacher automatiquement à ce lead.
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
          Le contrôle automatique tourne aussi régulièrement : aucun dossier n’est marqué créé avant d’exister réellement dans Onify.
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
          <p className="text-sm font-semibold text-foreground">Avant le dossier Onify</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Le client reste un lead. Le passage à « Prêt Onify » se fera quand la carte grise et l’attestation d’assurance obligatoires seront reçues.
          </p>
        </div>
      </div>
    </section>
  );
}
