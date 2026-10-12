// L'atelier interactif
//
// Les interventions du jour, posées dans un atelier vu de trois quarts.
// Chaque voiture porte un rendez-vous ; la toucher ouvre son panneau, et le
// panneau mène à la fiche existante.
//
// La vue liste n'est pas un repli dégradé : c'est la même information, dans
// un ordre lisible au clavier et par un lecteur d'écran, qui reste
// disponible quoi qu'il arrive à la 3D. Un navigateur sans WebGL, une
// tablette fatiguée, ou simplement l'envie de lire plutôt que de viser —
// tous les trois méritent la même réponse.

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, LayoutList, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EtatErreur } from '@/components/EtatErreur';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { InterventionCarteListe } from '@/features/interventions/intervention-carte-liste';
import {
  changerStatutIntervention, fetchInterventions, type Intervention,
} from '@/services/interventions-service';
import type { AppointmentStatus } from '@/types';
import { PanneauDossier } from './panneau-dossier';
import { ZONES, compterParZone, placerVehicules } from './zones-atelier';

/*
  Three.js, React Three Fiber et Drei pèsent plus que tout le reste du CRM
  réuni. Ils ne sont chargés qu'en entrant ici, et seulement si la vue 3D est
  demandée : ouvrir l'atelier en vue liste ne télécharge pas le moteur 3D.
*/
const SceneAtelier = lazy(() =>
  import('./scene-atelier').then((m) => ({ default: m.SceneAtelier })));

type Vue = 'atelier' | 'liste';

/** Bornes de la journée en cours. */
function journee(): { debut: string; fin: string } {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut.getTime() + 86_400_000 - 1);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

/**
 * Ce que l'on peut enregistrer, et rien de plus.
 *
 * La politique RLS ne laisse un technicien modifier que ses propres
 * rendez-vous. Proposer le bouton ailleurs produirait un échec silencieux —
 * autant ne pas le proposer.
 */
function statutsPossibles(
  intervention: Intervention | null,
  role: string | null,
  monId: string | null,
): AppointmentStatus[] {
  if (!intervention) return [];
  const gestionnaire = role === 'admin' || role === 'manager' || role === 'advisor';
  const sien = Boolean(monId && intervention.assigned_user_id === monId);
  if (!gestionnaire && !sien) return [];

  switch (intervention.statut) {
    case 'scheduled': return ['confirmed', 'cancelled'];
    case 'confirmed': return ['completed', 'cancelled'];
    case 'completed': return gestionnaire ? ['confirmed'] : [];
    default: return gestionnaire ? ['scheduled'] : [];
  }
}

export function AtelierPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [vue, setVue] = useState<Vue>('atelier');
  const [selection, setSelection] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { debut, fin } = useMemo(journee, []);

  /*
    L'heure est figée dans un état, pas relue à chaque rendu : sans cela,
    chaque re-rendu replacerait les véhicules sur une heure légèrement
    différente et relancerait l'animation sans raison. Elle avance d'une
    minute à la fois, ce qui suffit à faire passer une voiture de « À venir »
    à « En intervention » au bon moment.
  */
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(minuteur);
  }, []);

  const requete = useQuery({
    queryKey: ['atelier', debut.slice(0, 10)],
    queryFn: () => fetchInterventions({ debut, fin }),
    staleTime: 60_000,
    retry: false,
  });

  const interventions = useMemo(
    () => requete.data?.interventions ?? [],
    [requete.data],
  );
  const places = useMemo(
    () => placerVehicules(interventions, maintenant),
    [interventions, maintenant],
  );
  const compte = useMemo(() => compterParZone(places), [places]);

  const choisie = interventions.find((i) => i.id === selection) ?? null;
  const zoneChoisie = places.find((p) => p.intervention.id === selection)?.zone ?? null;

  /*
    Un enregistrement réussi rafraîchit la scène : la voiture rejoint sa
    nouvelle zone en glissant, puisque la place calculée a changé. C'est
    l'animation de déplacement — elle n'est pas décorative, elle dit ce qui
    vient de se passer et sur quel véhicule.
  */
  const enregistrer = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: AppointmentStatus }) =>
      changerStatutIntervention(id, statut),
    onMutate: () => setErreur(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['atelier'] }),
    onError: (e: Error) => setErreur(
      e.message || 'L’enregistrement n’a pas abouti. Réessayez.',
    ),
  });

  const ouvrirFiche = () => {
    if (!choisie?.lead_id) return;
    navigate(`/interventions/${choisie.lead_id}`, {
      state: { background: fondDepuis(location) },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader
        title="Atelier interactif"
        description="Les interventions du jour, à leur poste"
        action={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <div className="col-span-2 grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-0.5 sm:col-span-1 sm:inline-flex">
              {(['atelier', 'liste'] as Vue[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVue(v)}
                  aria-pressed={vue === v}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors sm:min-h-0 sm:py-1.5',
                    vue === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {v === 'atelier'
                    ? <><Boxes className="h-4 w-4" aria-hidden />Atelier</>
                    : <><LayoutList className="h-4 w-4" aria-hidden />Liste</>}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 w-full justify-center rounded-full sm:col-span-1 sm:w-auto"
              onClick={() => void requete.refetch()}
              disabled={requete.isFetching}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', requete.isFetching && 'animate-spin')} />
              Actualiser
            </Button>
          </div>
        }
      />

      {/* Les compteurs de postes, lisibles sans la 3D. */}
      <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 scrollbar-thin sm:px-4">
        {ZONES.map((zone) => (
          <span
            key={zone.cle}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: zone.couleur }}
              aria-hidden
            />
            {zone.label}
            <span className="font-semibold tabular text-foreground">{compte[zone.cle]}</span>
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-2 sm:p-4">
        {requete.isLoading ? (
          <div className="grid h-full gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Skeleton className="min-h-[320px] rounded-xl" />
            <Skeleton className="hidden rounded-xl lg:block" />
          </div>
        ) : requete.isError ? (
          <EtatErreur
            titre="Atelier indisponible"
            erreur={requete.error}
            onReessayer={() => void requete.refetch()}
            className="min-h-[320px] rounded-xl border border-dashed border-border"
          />
        ) : interventions.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 text-center">
            <Boxes className="h-10 w-10 text-muted-foreground/30" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Aucune intervention aujourd’hui. L’atelier est vide.
            </p>
          </div>
        ) : (
          <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-[320px] overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
              {vue === 'atelier' ? (
                <Suspense fallback={<ChargementScene />}>
                  <SceneAtelier
                    interventions={interventions}
                    selection={selection}
                    onSelectionner={setSelection}
                    maintenant={maintenant}
                  />
                </Suspense>
              ) : (
                <ListeAtelier
                  places={places}
                  selection={selection}
                  onSelectionner={setSelection}
                  monId={profile?.id ?? null}
                />
              )}
            </div>

            {/* Sous `lg`, le panneau passe sous la scène plutôt que de la
                rétrécir : un atelier large de 300 px ne se lit pas. */}
            <div className="min-h-0 lg:h-full">
              <PanneauDossier
                intervention={choisie}
                zone={zoneChoisie}
                onOuvrirFiche={ouvrirFiche}
                statutsPossibles={statutsPossibles(
                  choisie, profile?.role ?? null, profile?.id ?? null,
                )}
                onChangerStatut={(statut) => {
                  if (choisie) enregistrer.mutate({ id: choisie.id, statut });
                }}
                enregistrement={enregistrer.isPending}
                erreur={erreur}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChargementScene() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      Chargement de l’atelier…
    </div>
  );
}

/**
 * La même information, au clavier.
 *
 * Les cartes sont celles de l'écran des interventions : un seul composant à
 * maintenir, et un technicien retrouve la mise en page qu'il connaît.
 */
export function ListeAtelier({ places, selection, onSelectionner, monId }: {
  places: ReturnType<typeof placerVehicules>;
  selection: string | null;
  onSelectionner: (id: string) => void;
  monId: string | null;
}) {
  const parZone = ZONES.map((zone) => ({
    zone,
    elements: places.filter((p) => p.zone === zone.cle),
  })).filter((groupe) => groupe.elements.length > 0);

  return (
    <div className="h-full overflow-y-auto p-2 sm:p-3">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        {parZone.map(({ zone, elements }) => (
          <section key={zone.cle}>
            <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: zone.couleur }}
                aria-hidden
              />
              {zone.label}
              <span className="ml-auto font-normal normal-case tabular">
                {elements.length} véhicule{elements.length > 1 ? 's' : ''}
              </span>
            </h2>
            <div className="space-y-2">
              {elements.map(({ intervention }) => (
                <div
                  key={intervention.id}
                  className={cn(
                    'rounded-xl transition-shadow',
                    intervention.id === selection && 'ring-2 ring-primary',
                  )}
                >
                  <InterventionCarteListe
                    intervention={intervention}
                    onOuvrir={() => onSelectionner(intervention.id)}
                    aMoi={Boolean(monId && intervention.assigned_user_id === monId)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        {parZone.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Aucune intervention à afficher.
          </p>
        )}
      </div>
    </div>
  );
}
