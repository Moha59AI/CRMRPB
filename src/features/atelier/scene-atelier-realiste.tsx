// La vue realiste de l'atelier
//
// Le decor est un rendu isometrique prerendu : il garde un niveau de detail
// stable sur un ordinateur comme sur un telephone et ne monopolise plus le
// GPU. Les donnees, les zones cliquables et les libelles restent du HTML :
// ils sont toujours nets, accessibles et alimentes par les rendez-vous reels.

import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Clock3, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Intervention } from '@/services/interventions-service';
import { placerVehicules, type CleZone, type PlaceVehicule } from './zones-atelier';

export interface SceneAtelierRealisteProps {
  interventions: Intervention[];
  selection: string | null;
  onSelectionner: (id: string | null) => void;
  /** Recalcule a chaque rendu du parent : fige l'heure pour toute la scene. */
  maintenant: Date;
}

type ZoneAtelierVisible = Exclude<CleZone, 'annule'>;

interface PosteVisuel {
  zone: ZoneAtelierVisible;
  label: string;
  icone: LucideIcon;
  position: string;
  pastille: string;
}

const DECOR_ATELIER = '/images/atelier/atelier-realiste-v1.webp';

/*
  Les rectangles suivent les trois voitures du decor prerendu. Ils sont
  exprimes en pourcentages pour rester alignes quelle que soit la taille de
  l'ecran. Sur mobile, la scene conserve sa largeur et se parcourt au doigt :
  l'image ne se deforme jamais et les zones gardent une cible confortable.
*/
const POSTES: PosteVisuel[] = [
  {
    zone: 'a_venir',
    label: 'À venir',
    icone: Clock3,
    position: 'left-[12%] top-[31%] h-[39%] w-[25%]',
    pastille: 'border-slate-200 bg-white/95 text-slate-700',
  },
  {
    zone: 'en_cours',
    label: 'En intervention',
    icone: Wrench,
    position: 'left-[38%] top-[33%] h-[44%] w-[27%]',
    pastille: 'border-emerald-200 bg-emerald-50/95 text-emerald-800',
  },
  {
    zone: 'termine',
    label: 'Terminé',
    icone: CheckCircle2,
    position: 'left-[67%] top-[40%] h-[39%] w-[23%]',
    pastille: 'border-sky-200 bg-sky-50/95 text-sky-800',
  },
];

export function SceneAtelierRealiste({
  interventions, selection, onSelectionner, maintenant,
}: SceneAtelierRealisteProps) {
  const defilement = useRef<HTMLDivElement>(null);
  const places = useMemo(
    () => placerVehicules(interventions, maintenant),
    [interventions, maintenant],
  );

  const postes = useMemo(() => POSTES.map((poste) => {
    const candidates = places.filter((place) => place.zone === poste.zone);
    const place = candidates.find((candidate) => candidate.intervention.id === selection)
      ?? candidates[0]
      ?? null;
    return { ...poste, place };
  }), [places, selection]);

  const annuleeSelectionnee = useMemo(() => places.find((place) => (
    place.zone === 'annule' && place.intervention.id === selection
  )) ?? null, [places, selection]);

  useEffect(() => {
    const active = defilement.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selection]);

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden bg-[#dfe7e2]">
      <div ref={defilement} className="h-full w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
        <div
          className="relative h-full min-h-[405px] min-w-[720px] overflow-hidden bg-[#dfe7e2]"
          onClick={(evenement) => {
            if (evenement.currentTarget === evenement.target) onSelectionner(null);
          }}
        >
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-200 to-emerald-100" />
          <img
            src={DECOR_ATELIER}
            alt="Atelier Relais Pare-Brise en vue isométrique avec trois postes de travail"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
            draggable={false}
            loading="eager"
            decoding="async"
          />

          {/* Assombrit tres legerement les bords pour garder les pastilles
              lisibles sans aplatir le rendu lumineux du decor. */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_48%,transparent_45%,rgba(15,23,42,0.12)_100%)]" />

          <div className="pointer-events-none absolute left-[43%] top-[7%] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/80 bg-white/90 px-3 py-1.5 text-slate-900 shadow-md backdrop-blur-sm">
            <span className="rounded-md bg-emerald-600 px-1.5 py-1 text-[11px] font-black tracking-[-0.06em] text-white">
              RPB
            </span>
            <span className="leading-none">
              <strong className="block text-[9px] tracking-wide">RELAIS</strong>
              <span className="mt-0.5 block text-[6px] font-bold tracking-[0.17em] text-emerald-700">
                PARE-BRISE
              </span>
            </span>
          </div>

          {postes.map((poste) => (
            <PosteInteractif
              key={poste.zone}
              poste={poste}
              selectionne={poste.place?.intervention.id === selection}
              onSelectionner={onSelectionner}
            />
          ))}

          {annuleeSelectionnee && (
            <button
              type="button"
              className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-red-200 bg-white/95 px-3 py-2 text-xs font-semibold text-red-700 shadow-lg backdrop-blur-sm"
              onClick={() => onSelectionner(annuleeSelectionnee.intervention.id)}
              aria-pressed
            >
              <XCircle className="h-4 w-4" aria-hidden />
              Rendez-vous annulé : {libelleCourt(annuleeSelectionnee)}
            </button>
          )}

          <div className="pointer-events-none absolute bottom-3 right-3 hidden rounded-full border border-white/70 bg-slate-950/65 px-3 py-1.5 text-[10px] font-medium text-white shadow-lg backdrop-blur-sm sm:block">
            Vue réaliste indicative · dossiers en temps réel
          </div>
        </div>
      </div>
    </div>
  );
}

function PosteInteractif({ poste, selectionne, onSelectionner }: {
  poste: PosteVisuel & { place: PlaceVehicule | null };
  selectionne: boolean;
  onSelectionner: (id: string | null) => void;
}) {
  const { place, icone: Icone } = poste;
  const intervention = place?.intervention ?? null;

  return (
    <button
      type="button"
      disabled={!intervention}
      onClick={(evenement) => {
        evenement.stopPropagation();
        if (intervention) onSelectionner(intervention.id);
      }}
      aria-pressed={selectionne}
      aria-label={intervention
        ? `Sélectionner ${intervention.vehicule || intervention.client || intervention.titre}`
        : `${poste.label} : aucun véhicule`}
      className={cn(
        'group absolute z-10 rounded-[22px] text-left outline-none transition-all duration-200',
        poste.position,
        intervention
          ? 'cursor-pointer hover:bg-white/5 hover:ring-2 hover:ring-white/90 focus-visible:ring-4 focus-visible:ring-emerald-300'
          : 'cursor-default bg-slate-950/10 backdrop-grayscale',
        selectionne && 'bg-emerald-300/5 ring-4 ring-emerald-400/95 shadow-[0_0_30px_rgba(16,185,129,0.42)]',
      )}
    >
      <span className={cn(
        'absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-sm',
        poste.pastille,
      )}>
        <Icone className="h-3 w-3" aria-hidden />
        {poste.label}
      </span>

      {intervention ? (
        <span className={cn(
          'absolute bottom-2 left-1/2 min-w-[138px] max-w-[88%] -translate-x-1/2 rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md transition-transform group-hover:-translate-y-0.5',
          selectionne
            ? 'border-emerald-400 bg-emerald-600/95 text-white'
            : 'border-white/80 bg-white/95 text-slate-900',
        )}>
          <strong className="block truncate text-[11px] font-bold leading-tight">
            {intervention.immatriculation || `RDV ${heureCourte(intervention.debut)}`}
          </strong>
          <span className={cn(
            'mt-0.5 block truncate text-[9px] leading-tight',
            selectionne ? 'text-white/85' : 'text-slate-600',
          )}>
            {intervention.vehicule || intervention.client || 'Véhicule à renseigner'}
          </span>
        </span>
      ) : (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/70 bg-slate-900/70 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm">
          Aucun rendez-vous
        </span>
      )}
    </button>
  );
}

function heureCourte(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  });
}

function libelleCourt(place: PlaceVehicule): string {
  const intervention = place.intervention;
  return intervention.immatriculation
    || intervention.vehicule
    || intervention.client
    || `RDV ${heureCourte(intervention.debut)}`;
}
