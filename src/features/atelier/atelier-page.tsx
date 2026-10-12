// L'atelier interactif
//
// Les interventions du jour, posées dans un atelier vu de trois quarts.
// Chaque voiture porte un rendez-vous ; la toucher ouvre son panneau, et le
// panneau mène à la fiche existante.
//
// La vue liste n'est pas un repli dégradé : c'est la même information, dans
// un ordre lisible au clavier et par un lecteur d'écran, qui reste
// disponible quoi qu'il arrive à l'illustration. Un petit écran, une
// connexion lente, ou simplement l'envie de lire plutôt que de viser — tous
// les trois méritent la même réponse.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes, CalendarDays, CarFront, CheckCircle2, ClipboardList, LayoutList,
  Loader2, Plus, RefreshCw, ScanLine, ShieldCheck, Wrench, type LucideIcon,
} from 'lucide-react';
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
import { ZONES, compterParZone, placerVehicules, type CleZone } from './zones-atelier';

/* Le decor realiste reste charge a la demande : ouvrir l'atelier directement
   en vue liste ne telecharge pas l'image haute definition. */
const SceneAtelier = lazy(() =>
  import('./scene-atelier-realiste').then((m) => ({ default: m.SceneAtelierRealiste })));

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
  const selectionInitialisee = useRef(false);

  // À l'ouverture, le véhicule actuellement en intervention est le plus
  // utile. Ensuite la sélection appartient à l'utilisateur : un clic dans
  // le vide peut réellement fermer le panneau.
  useEffect(() => {
    if (selectionInitialisee.current || interventions.length === 0) return;
    const prioritaire = places.find((place) => place.zone === 'en_cours')
      ?? places.find((place) => place.zone === 'a_venir')
      ?? places[0];
    if (prioritaire) setSelection(prioritaire.intervention.id);
    selectionInitialisee.current = true;
  }, [interventions.length, places]);

  useEffect(() => {
    if (selection && !interventions.some((intervention) => intervention.id === selection)) {
      setSelection(null);
    }
  }, [interventions, selection]);

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
      <EnteteAtelier
        vue={vue}
        onChangerVue={setVue}
        compte={compte}
        total={interventions.length}
        actualisation={requete.isFetching}
        onActualiser={() => void requete.refetch()}
        onNouveauDossier={() => navigate('/leads', { state: { ouvrirNouveauLead: true } })}
      />

      {/* Les compteurs de postes, lisibles sans la 3D. */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-card px-2 py-2 scrollbar-thin sm:px-4">
        {ZONES.map((zone) => (
          <span
            key={zone.cle}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs shadow-sm"
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
          <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm xl:min-h-0">
              <div className="min-h-[390px] flex-1 overflow-hidden">
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
              <ParcoursAtelier intervention={choisie} zone={zoneChoisie} />
            </div>

            {/* Sous `lg`, le panneau passe sous la scène plutôt que de la
                rétrécir : un atelier large de 300 px ne se lit pas. */}
            <div className="min-h-0 xl:h-full">
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

function EnteteAtelier({
  vue, onChangerVue, compte, total, actualisation, onActualiser, onNouveauDossier,
}: {
  vue: Vue;
  onChangerVue: (vue: Vue) => void;
  compte: ReturnType<typeof compterParZone>;
  total: number;
  actualisation: boolean;
  onActualiser: () => void;
  onNouveauDossier: () => void;
}) {
  const aujourdHui = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date());

  const indicateurs: { label: string; valeur: number; icone: LucideIcon; couleur: string }[] = [
    { label: 'véhicules', valeur: total, icone: CarFront, couleur: 'text-slate-700 bg-slate-100' },
    { label: 'en intervention', valeur: compte.en_cours, icone: Wrench, couleur: 'text-emerald-700 bg-emerald-100' },
    { label: 'terminés', valeur: compte.termine, icone: CheckCircle2, couleur: 'text-sky-700 bg-sky-100' },
  ];

  return (
    <header className="border-b border-border bg-card">
      <div className="gutter-x flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Atelier interactif</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Suivez les véhicules et ouvrez leur dossier depuis leur poste.
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium capitalize text-foreground shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {aujourdHui}
          </span>

          <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/50 p-0.5">
            {(['atelier', 'liste'] as Vue[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onChangerVue(v)}
                aria-pressed={vue === v}
                className={cn(
                  'flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] px-2.5 text-xs font-semibold transition-colors',
                  vue === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'atelier'
                  ? <><Boxes className="h-3.5 w-3.5" aria-hidden />Vue atelier</>
                  : <><LayoutList className="h-3.5 w-3.5" aria-hidden />Liste</>}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl border border-border bg-background"
            onClick={onActualiser}
            disabled={actualisation}
            aria-label="Actualiser l’atelier"
          >
            <RefreshCw className={cn('h-4 w-4', actualisation && 'animate-spin')} />
          </Button>

          <Button
            type="button"
            size="sm"
            className="min-h-9 rounded-xl bg-emerald-600 px-3 font-semibold hover:bg-emerald-700"
            onClick={onNouveauDossier}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Nouveau dossier
          </Button>
        </div>
      </div>

      <div className="gutter-x flex gap-2 overflow-x-auto pb-3 scrollbar-thin">
        {indicateurs.map(({ label, valeur, icone: Icone, couleur }) => (
          <div key={label} className="flex min-w-[132px] items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 shadow-sm">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', couleur)}>
              <Icone className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm font-bold tabular-nums text-foreground">{valeur}</strong>
              <span className="block truncate text-[10px] text-muted-foreground">{label}</span>
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}

const ETAPES_ATELIER: { label: string; icone: LucideIcon }[] = [
  { label: 'Dossier', icone: ClipboardList },
  { label: 'Vitrage', icone: ScanLine },
  { label: 'Pose', icone: Wrench },
  { label: 'Contrôle', icone: ShieldCheck },
  { label: 'Restitution', icone: CheckCircle2 },
];

function ParcoursAtelier({ intervention, zone }: {
  intervention: Intervention | null;
  zone: CleZone | null;
}) {
  const active = !intervention ? -1
    : zone === 'termine' ? 4
      : zone === 'en_cours' ? 2
        : zone === 'a_venir' ? 1
          : 0;

  return (
    <nav aria-label="Avancement du dossier" className="overflow-x-auto border-t border-border bg-card px-3 py-2.5 sm:px-5">
      <ol className="grid min-w-[430px] grid-cols-5">
        {ETAPES_ATELIER.map(({ label, icone: Icone }, index) => {
          const terminee = index < active;
          const courante = index === active;
          return (
            <li key={label} className="relative flex flex-col items-center gap-1 text-center">
              {index > 0 && (
                <span className={cn(
                  'absolute right-1/2 top-3.5 h-0.5 w-full',
                  index <= active ? 'bg-emerald-500' : 'bg-border',
                )} aria-hidden />
              )}
              <span className={cn(
                'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border transition-colors',
                terminee && 'border-emerald-500 bg-emerald-500 text-white',
                courante && 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-100/80',
                !terminee && !courante && 'border-border bg-background text-muted-foreground',
              )}>
                {terminee
                  ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  : <Icone className="h-3.5 w-3.5" aria-hidden />}
              </span>
              <span
                aria-current={courante ? 'step' : undefined}
                className={cn('text-[9px] font-medium sm:text-[10px]', courante ? 'text-emerald-700' : 'text-muted-foreground')}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
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
