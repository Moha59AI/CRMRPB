import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RelanceRow } from './components/relance-row';
import {
  fetchRelances, reporterRelance, marquerRelanceTraitee, compterRelances,
  type Relance, type UrgencyLevel,
} from '@/services/relances-service';

const SECTIONS: { niveau: UrgencyLevel; titre: string; aide: string }[] = [
  { niveau: 'urgent', titre: 'En retard', aide: 'À traiter en priorité' },
  { niveau: 'due', titre: "Aujourd'hui", aide: 'Prévu pour aujourd’hui' },
  { niveau: 'upcoming', titre: 'À venir', aide: 'Les sept prochains jours' },
];

const COULEUR_COMPTEUR: Record<UrgencyLevel, string> = {
  urgent: 'text-urgent',
  due: 'text-due',
  upcoming: 'text-upcoming',
};

export function RelancesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [enCours, setEnCours] = useState<string | null>(null);

  const { data: relances, isLoading } = useQuery({
    queryKey: ['relances'],
    queryFn: () => fetchRelances(),
  });

  const compteurs = useMemo(() => compterRelances(relances ?? []), [relances]);

  const groupes = useMemo(() => {
    const parNiveau: Record<UrgencyLevel, Relance[]> = { urgent: [], due: [], upcoming: [] };
    for (const r of relances ?? []) parNiveau[r.urgency].push(r);
    return parNiveau;
  }, [relances]);

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['relances'] });

  const reporter = useMutation({
    mutationFn: (relance: Relance) => reporterRelance(relance, 1),
    onSuccess: (_data, relance) => {
      toast.success(`${relance.title} reporté à demain`);
      rafraichir();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setEnCours(null),
  });

  const traiter = useMutation({
    mutationFn: marquerRelanceTraitee,
    onSuccess: (_data, relance) => {
      toast.success(`${relance.title} traité`);
      rafraichir();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setEnCours(null),
  });

  // L'animation de sortie dure le temps du fondu avant que la ligne disparaisse
  // vraiment : l'utilisateur voit ce qu'il vient de faire.
  const lancer = (relance: Relance, action: (r: Relance) => void) => {
    setEnCours(relance.id);
    window.setTimeout(() => action(relance), 280);
  };

  const appeler = (relance: Relance) => {
    if (relance.phone) window.location.href = `tel:${relance.phone}`;
  };

  const envoyerSms = (relance: Relance) => {
    if (relance.phone) window.location.href = `sms:${relance.phone}`;
  };

  const ouvrir = (relance: Relance) => {
    if (relance.leadId) navigate(`/leads?lead=${relance.leadId}`);
  };

  return (
    <>
      <PageHeader
        title="Relances"
        description="Tout ce qui attend une action de votre part, au même endroit"
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-72 rounded-xl" />
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : compteurs.total === 0 ? (
            <EtatVide />
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-baseline gap-x-8 gap-y-3">
                <div>
                  <p className="text-4xl font-semibold tabular text-foreground">
                    {compteurs.total}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {compteurs.total === 1 ? 'relance à traiter' : 'relances à traiter'}
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  {SECTIONS.map(({ niveau, titre }) =>
                    compteurs[niveau] > 0 ? (
                      <div key={niveau}>
                        <p className={cn('text-xl font-semibold tabular', COULEUR_COMPTEUR[niveau])}>
                          {compteurs[niveau]}
                        </p>
                        <p className="text-xs text-muted-foreground">{titre}</p>
                      </div>
                    ) : null
                  )}
                </div>
              </div>

              <div className="space-y-8">
                {SECTIONS.map(({ niveau, titre, aide }) => {
                  const lignes = groupes[niveau];
                  if (lignes.length === 0) return null;

                  return (
                    <section key={niveau}>
                      <div className="mb-3 flex items-baseline gap-2">
                        <h2 className="text-sm font-semibold text-foreground">{titre}</h2>
                        <span className="text-xs text-muted-foreground">
                          {lignes.length} · {aide}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {lignes.map((relance) => (
                          <RelanceRow
                            key={relance.id}
                            relance={relance}
                            enCours={enCours === relance.id}
                            onAppeler={appeler}
                            onSms={envoyerSms}
                            onOuvrir={ouvrir}
                            onReporter={(r) => lancer(r, reporter.mutate)}
                            onTraiter={(r) => lancer(r, traiter.mutate)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          {(reporter.isPending || traiter.isPending) && (
            <div className="pointer-events-none fixed bottom-6 right-6 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              Enregistrement…
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EtatVide() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-done-soft">
        <CheckCircle2 className="h-7 w-7 text-done" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Rien à relancer</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Aucun lead en attente, aucune tâche en retard et aucun rendez-vous à confirmer
        dans les sept prochains jours.
      </p>
    </div>
  );
}
