// Le panneau du véhicule sélectionné
//
// Du HTML, délibérément. Tout ce qui se lit, se copie, se tabule ou
// s'annonce à un lecteur d'écran reste hors du canvas : un libellé dessiné
// en 3D se lit de biais, ne se sélectionne pas, et n'existe pas pour les
// technologies d'assistance.

import {
  ArrowUpRight, CarFront, Check, CircleDashed, Clock3, FileCheck2,
  Loader2, MapPin, Phone, UserRound, Wrench, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LIBELLE_STATUT_RDV, PASTILLE_STATUT_RDV } from '@/features/calendar/statut-rendez-vous';
import type { Intervention } from '@/services/interventions-service';
import type { AppointmentStatus } from '@/types';
import { LIBELLE_ZONE, type CleZone } from './zones-atelier';

export interface PanneauDossierProps {
  intervention: Intervention | null;
  zone: CleZone | null;
  onOuvrirFiche: () => void;
  /** Proposés seulement quand l'enregistrement aboutira. */
  statutsPossibles: AppointmentStatus[];
  onChangerStatut: (statut: AppointmentStatus) => void;
  enregistrement: boolean;
  erreur: string | null;
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function PanneauDossier({
  intervention, zone, onOuvrirFiche, statutsPossibles, onChangerStatut,
  enregistrement, erreur,
}: PanneauDossierProps) {
  if (!intervention) {
    return (
      <aside className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-7 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CarFront className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-foreground">Sélectionnez un véhicule</p>
        <p className="max-w-[230px] text-xs leading-relaxed text-muted-foreground">
          Touchez une voiture dans l’atelier pour afficher son dossier et ses actions.
        </p>
      </aside>
    );
  }

  const i = intervention;
  const controleDossier = [
    { label: 'Fiche client rattachée', ok: Boolean(i.lead_id) },
    { label: 'Véhicule identifié', ok: Boolean(i.vehicule) },
    { label: 'Immatriculation renseignée', ok: Boolean(i.immatriculation) },
    { label: 'Lieu d’intervention renseigné', ok: Boolean(i.adresse) },
  ];

  return (
    <aside
      aria-live="polite"
      className="flex h-full min-h-0 flex-col overflow-y-auto rounded-2xl border border-border bg-card shadow-sm"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Dossier atelier
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-foreground">
            {i.immatriculation || `Rendez-vous ${heure(i.debut)}`}
          </p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold',
          PASTILLE_STATUT_RDV[i.statut],
        )}>
          {LIBELLE_STATUT_RDV[i.statut]}
        </span>
      </header>

      <div className="relative shrink-0 overflow-hidden border-b border-border bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 pb-4 pt-3">
        <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-emerald-100/70 blur-2xl" />
        <div className="flex min-h-[96px] items-center justify-center">
          <div className="relative flex h-20 w-36 items-center justify-center rounded-[48%_48%_34%_34%] bg-gradient-to-b from-slate-300 to-slate-500 shadow-[0_14px_22px_-16px_rgba(15,23,42,0.8)]">
            <div className="absolute top-2 h-7 w-[76px] rounded-b-md rounded-t-2xl bg-slate-700/90" />
            <CarFront className="relative mt-3 h-16 w-16 text-white/90" strokeWidth={1.35} aria-hidden />
            <span className="absolute -bottom-1 left-3 h-3 w-4 rounded-full bg-slate-900" />
            <span className="absolute -bottom-1 right-3 h-3 w-4 rounded-full bg-slate-900" />
          </div>
        </div>
        <h2 className="truncate text-base font-bold text-foreground">
          {i.vehicule || 'Véhicule à renseigner'}
        </h2>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {i.titre}
        </p>
        {zone && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
            <Wrench className="h-3 w-3" aria-hidden />
            {LIBELLE_ZONE[zone]}
          </span>
        )}
      </div>

      <dl className="shrink-0 divide-y divide-border">
        <Ligne icone={Clock3} libelle="Créneau">
          <span className="tabular-nums">{heure(i.debut)} – {heure(i.fin)}</span>
        </Ligne>
        <Ligne icone={UserRound} libelle="Client">
          {i.client || <span className="text-faint">Non rattaché</span>}
        </Ligne>
        <Ligne icone={Phone} libelle="Téléphone">
          {i.telephone
            ? <a href={`tel:${i.telephone}`} className="font-medium text-primary hover:underline">{i.telephone}</a>
            : <span className="text-faint">Aucun numéro</span>}
        </Ligne>
        <Ligne icone={MapPin} libelle="Lieu">
          {i.adresse || <span className="text-faint">Aucune adresse</span>}
        </Ligne>
      </dl>

      <section className="shrink-0 border-t border-border px-4 py-3" aria-labelledby="preparation-dossier">
        <div className="mb-2 flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-emerald-600" aria-hidden />
          <h3 id="preparation-dossier" className="text-xs font-semibold text-foreground">
            Préparation du dossier
          </h3>
        </div>
        <ul className="space-y-1.5">
          {controleDossier.map((element) => (
            <li key={element.label} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                element.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400',
              )}>
                {element.ok
                  ? <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
                  : <CircleDashed className="h-2.5 w-2.5" aria-hidden />}
              </span>
              {element.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Les actions qui écrivent. Un échec se dit ici, à côté du bouton qui
          l'a provoqué, et non dans un message qui disparaît. */}
      <div className="mt-auto shrink-0 space-y-2 border-t border-border p-3 sm:p-4">
        {erreur && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erreur}
          </p>
        )}

        {statutsPossibles.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {statutsPossibles.map((statut) => (
              <Button
                key={statut}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 rounded-xl text-[11px]"
                onClick={() => onChangerStatut(statut)}
                disabled={enregistrement}
              >
                {enregistrement && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {LIBELLE_STATUT_RDV[statut]}
              </Button>
            ))}
          </div>
        )}

        <Button
          type="button"
          className="min-h-11 w-full rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700"
          onClick={onOuvrirFiche}
          disabled={!i.lead_id}
        >
          <ArrowUpRight className="mr-1.5 h-4 w-4" aria-hidden />
          {i.lead_id ? 'Voir le dossier complet' : 'Aucune fiche rattachée'}
        </Button>
      </div>
    </aside>
  );
}

function Ligne({ icone: Icone, libelle, children }: {
  icone: LucideIcon; libelle: string; children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[18px_68px_minmax(0,1fr)] items-start gap-2 px-4 py-2.5 text-xs">
      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <dt className="text-[11px] text-muted-foreground">{libelle}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">{children}</dd>
    </div>
  );
}
