// Le panneau du véhicule sélectionné
//
// Du HTML, délibérément. Tout ce qui se lit, se copie, se tabule ou
// s'annonce à un lecteur d'écran reste hors du canvas : un libellé dessiné
// en 3D se lit de biais, ne se sélectionne pas, et n'existe pas pour les
// technologies d'assistance.

import { ArrowUpRight, Car, Clock, Loader2, MapPin, Phone, User } from 'lucide-react';
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
      <aside className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <Car className="h-8 w-8 text-muted-foreground/30" aria-hidden />
        <p className="text-sm font-medium text-foreground">Aucun véhicule sélectionné</p>
        <p className="text-xs text-muted-foreground">
          Touchez une voiture dans l’atelier, ou choisissez-la dans la liste.
        </p>
      </aside>
    );
  }

  const i = intervention;

  return (
    <aside
      aria-live="polite"
      className="flex h-full min-h-0 flex-col overflow-y-auto rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border bg-muted/25 px-3 py-2.5 sm:px-4">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {i.client || i.titre}
          </h2>
          <span className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            PASTILLE_STATUT_RDV[i.statut],
          )}>
            {LIBELLE_STATUT_RDV[i.statut]}
          </span>
        </div>
        {zone && (
          <p className="mt-1 text-xs text-muted-foreground">
            Poste : <span className="font-medium text-foreground">{LIBELLE_ZONE[zone]}</span>
          </p>
        )}
      </header>

      <dl className="divide-y divide-border">
        <Ligne icone={Clock} libelle="Créneau">
          <span className="tabular">{heure(i.debut)} – {heure(i.fin)}</span>
        </Ligne>
        <Ligne icone={Car} libelle="Véhicule">
          {i.vehicule || i.immatriculation
            ? <>{i.vehicule}{i.vehicule && i.immatriculation ? ' · ' : ''}
              {i.immatriculation && <span className="tabular">{i.immatriculation}</span>}</>
            : <span className="text-faint">Non renseigné</span>}
        </Ligne>
        <Ligne icone={User} libelle="Client">
          {i.client || <span className="text-faint">Non rattaché</span>}
        </Ligne>
        <Ligne icone={Phone} libelle="Téléphone">
          {i.telephone
            ? <a href={`tel:${i.telephone}`} className="text-primary hover:underline">{i.telephone}</a>
            : <span className="text-faint">Aucun numéro</span>}
        </Ligne>
        <Ligne icone={MapPin} libelle="Adresse">
          {i.adresse || <span className="text-faint">Aucune adresse</span>}
        </Ligne>
      </dl>

      {/* Les actions qui écrivent. Un échec se dit ici, à côté du bouton qui
          l'a provoqué, et non dans un message qui disparaît. */}
      <div className="mt-auto space-y-2 border-t border-border p-3 sm:p-4">
        {erreur && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erreur}
          </p>
        )}

        {statutsPossibles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {statutsPossibles.map((statut) => (
              <Button
                key={statut}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 flex-1 rounded-full text-xs sm:min-h-0"
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
          className="min-h-11 w-full rounded-full sm:min-h-0"
          onClick={onOuvrirFiche}
          disabled={!i.lead_id}
        >
          <ArrowUpRight className="mr-1.5 h-4 w-4" aria-hidden />
          {i.lead_id ? 'Ouvrir la fiche' : 'Aucune fiche rattachée'}
        </Button>
      </div>
    </aside>
  );
}

function Ligne({ icone: Icone, libelle, children }: {
  icone: typeof Car; libelle: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 text-sm sm:px-4">
      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <dt className="w-[76px] shrink-0 text-xs text-muted-foreground">{libelle}</dt>
      <dd className="min-w-0 flex-1 break-words text-foreground">{children}</dd>
    </div>
  );
}
