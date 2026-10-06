// La liste des interventions — l'écran d'accueil du technicien
//
// Ce qu'on vient y chercher tient en trois mots : où, quand, avec qui. Le
// reste du CRM — pipeline, facturation, campagnes — n'a pas sa place ici.
//
// « Aujourd'hui » s'ouvre en premier parce que c'est la question du matin.
// Les autres périodes sont à une tape, et chaque onglet annonce son nombre :
// un onglet vide se voit avant d'être ouvert.
//
// Rien n'est masqué en silence. Une période sans intervention le dit, une
// panne de chargement le dit, et une période trop fournie annonce qu'elle est
// tronquée plutôt que de laisser croire que la tournée affichée est complète.

import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarCheck2, CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EtatErreur } from '@/components/EtatErreur';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import {
  changerStatutIntervention, fetchInterventions, type Intervention,
} from '@/services/interventions-service';
import { InterventionCarteListe } from './intervention-carte-liste';

type Periode = 'aujourdhui' | 'avenir' | 'passees';

const JOUR_MS = 86_400_000;

function bornes(periode: Periode): { debut: string; fin: string } {
  const debutDuJour = new Date();
  debutDuJour.setHours(0, 0, 0, 0);
  const finDuJour = new Date(debutDuJour.getTime() + JOUR_MS - 1);

  if (periode === 'aujourdhui') {
    return { debut: debutDuJour.toISOString(), fin: finDuJour.toISOString() };
  }
  if (periode === 'avenir') {
    // Demain inclus, puis deux semaines : au-dela, un planning de terrain
    // n'est plus une information, c'est une prevision.
    return {
      debut: new Date(debutDuJour.getTime() + JOUR_MS).toISOString(),
      fin: new Date(debutDuJour.getTime() + 15 * JOUR_MS).toISOString(),
    };
  }
  return {
    debut: new Date(debutDuJour.getTime() - 14 * JOUR_MS).toISOString(),
    fin: new Date(debutDuJour.getTime() - 1).toISOString(),
  };
}

const LIBELLE_PERIODE: Record<Periode, string> = {
  aujourdhui: 'Aujourd’hui',
  avenir: 'À venir',
  passees: 'Passées',
};

const VIDE: Record<Periode, string> = {
  aujourdhui: 'Aucune intervention aujourd’hui.',
  avenir: 'Aucune intervention prévue dans les quinze prochains jours.',
  passees: 'Aucune intervention sur les quinze derniers jours.',
};

export function InterventionsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [periode, setPeriode] = useState<Periode>('aujourdhui');

  // Les trois périodes sont chargées ensemble : les compteurs des onglets ne
  // valent que s'ils sont tous là, et ouvrir un onglet vide pour l'apprendre
  // est exactement ce qu'on veut éviter sur un téléphone.
  const requetes = {
    aujourdhui: useRequete('aujourdhui'),
    avenir: useRequete('avenir'),
    passees: useRequete('passees'),
  };
  const courante = requetes[periode];

  const terminer = useMutation({
    mutationFn: (id: string) => changerStatutIntervention(id, 'completed'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['interventions'] });
      toast.success('Intervention marquée terminée');
    },
    onError: (erreur: Error) => toast.error(erreur.message),
  });

  const parJour = useMemo(
    () => grouperParJour(courante.data?.interventions ?? []),
    [courante.data],
  );

  const ouvrir = (intervention: Intervention) => {
    if (!intervention.lead_id) {
      toast.info('Ce rendez-vous n’est rattaché à aucune fiche.');
      return;
    }
    navigate(`/interventions/${intervention.lead_id}`, {
      state: { background: fondDepuis(location) },
    });
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageHeader
        title="Interventions"
        description="Où aller, quand, et comment s’y rendre"
        action={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center rounded-full sm:w-auto"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['interventions'] })}
            disabled={courante.isFetching}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', courante.isFetching && 'animate-spin')} />
            Actualiser
          </Button>
        }
      />

      {/* Les trois périodes, chacune avec son nombre. Un onglet vide se voit
          sans qu'on ait à l'ouvrir. */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-2 py-2 backdrop-blur sm:px-4">
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
          {(['aujourdhui', 'avenir', 'passees'] as Periode[]).map((cle) => {
            const nombre = requetes[cle].data?.interventions.length;
            return (
              <button
                key={cle}
                type="button"
                onClick={() => setPeriode(cle)}
                aria-current={periode === cle ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors',
                  periode === cle
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {LIBELLE_PERIODE[cle]}
                {nombre != null && nombre > 0 && (
                  <span className="tabular text-xs font-semibold">{nombre}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-2 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-2xl">
          {courante.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
          ) : courante.isError ? (
            <EtatErreur
              titre="Interventions indisponibles"
              erreur={courante.error}
              onReessayer={() => void courante.refetch()}
              className="min-h-[320px] rounded-xl border border-dashed border-border"
            />
          ) : parJour.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 text-center">
              <CalendarCheck2 className="h-10 w-10 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">{VIDE[periode]}</p>
            </div>
          ) : (
            <>
              {courante.data?.tronque && (
                <p className="mb-3 flex items-start gap-2 rounded-xl border border-due/30 bg-due-soft px-3 py-2 text-xs text-foreground">
                  <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-due" aria-hidden />
                  Beaucoup d’interventions sur cette période : seules les
                  premières sont affichées.
                </p>
              )}

              <div className="space-y-5">
                {parJour.map(({ jour, interventions }) => (
                  <section key={jour}>
                    <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {titreDuJour(jour)}
                      <span className="ml-2 font-normal normal-case tabular">
                        {interventions.length} intervention{interventions.length > 1 ? 's' : ''}
                      </span>
                    </h2>
                    <div className="space-y-2">
                      {interventions.map((intervention) => (
                        <InterventionCarteListe
                          key={intervention.id}
                          intervention={intervention}
                          onOuvrir={() => ouvrir(intervention)}
                          aMoi={Boolean(
                            profile?.id && intervention.assigned_user_id === profile.id,
                          )}
                          onTerminer={() => terminer.mutate(intervention.id)}
                          changementEnCours={terminer.isPending}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}

          {courante.isFetching && !courante.isLoading && (
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Mise à jour…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function useRequete(periode: Periode) {
  const { debut, fin } = bornes(periode);
  return useQuery({
    queryKey: ['interventions', periode, debut.slice(0, 10)],
    queryFn: () => fetchInterventions({ debut, fin }),
    // Le planning du jour bouge pendant qu'on roule.
    staleTime: 60_000,
    retry: false,
  });
}

function grouperParJour(interventions: Intervention[]): {
  jour: string; interventions: Intervention[];
}[] {
  const groupes = new Map<string, Intervention[]>();
  for (const i of interventions) {
    const jour = i.debut.slice(0, 10);
    const liste = groupes.get(jour);
    if (liste) liste.push(i); else groupes.set(jour, [i]);
  }
  return [...groupes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([jour, liste]) => ({ jour, interventions: liste }));
}

function titreDuJour(jour: string): string {
  const date = new Date(`${jour}T12:00:00`);
  const aujourdhui = new Date();
  aujourdhui.setHours(12, 0, 0, 0);
  const ecart = Math.round((date.getTime() - aujourdhui.getTime()) / JOUR_MS);

  if (ecart === 0) return 'Aujourd’hui';
  if (ecart === 1) return 'Demain';
  if (ecart === -1) return 'Hier';

  const libelle = date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}
