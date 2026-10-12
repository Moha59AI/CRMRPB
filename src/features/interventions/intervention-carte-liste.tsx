// Une intervention dans la liste du terrain
//
// Pensee pour un pouce et un bras tendu : trois gestes seulement -- appeler,
// y aller, ouvrir la fiche -- chacun sur une cible de 44 px, alignes sur une
// seule ligne qu'on atteint sans viser.
//
// L'heure prend la colonne de gauche et ne bouge jamais. C'est elle qu'on
// cherche en descendant la liste ; un oeil qui doit la retrouver a chaque
// bloc ne lit plus, il dechiffre.

import { Car, ChevronRight, MapPin, Navigation, Phone, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { lienItineraire } from '@/services/adresse-service';
import { LIBELLE_STATUT_RDV, PASTILLE_STATUT_RDV } from '@/features/calendar/statut-rendez-vous';
import type { Intervention } from '@/services/interventions-service';
import { InterventionWeather } from './intervention-weather';

export interface InterventionCarteListeProps {
  intervention: Intervention;
  onOuvrir: () => void;
  /** Vrai quand le rendez-vous est affecte a l'utilisateur courant. */
  aMoi: boolean;
  /** Proposee seulement la ou elle aboutira : un technicien ne modifie que ses rendez-vous. */
  onTerminer?: () => void;
  changementEnCours?: boolean;
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function InterventionCarteListe({
  intervention, onOuvrir, aMoi, onTerminer, changementEnCours,
}: InterventionCarteListeProps) {
  const i = intervention;
  const annulee = i.statut === 'cancelled';
  const terminee = i.statut === 'completed';

  // Les coordonnees du rendez-vous passent avant son adresse en toutes
  // lettres : elles ont ete posees pour ce lieu-la. Un point au centre de la
  // commune n'en est pas un -- il menerait devant la mairie.
  const itineraire = i.geo_precision === 'exact' && i.latitude != null && i.longitude != null
    ? lienItineraire({ latitude: i.latitude, longitude: i.longitude })
    : i.adresse
      ? lienItineraire({ address: i.adresse })
      : null;

  return (
    <article
      className={cn(
        'rounded-xl border border-border bg-card',
        annulee && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={onOuvrir}
        className="flex w-full items-start gap-3 rounded-t-xl p-3 text-left transition-colors hover:bg-surface active:bg-surface"
      >
        {/* Colonne d'heure, constante d'une carte a l'autre. */}
        <span className="flex w-[52px] shrink-0 flex-col items-start pt-0.5">
          <span className={cn(
            'text-base font-semibold tabular leading-none',
            terminee || annulee ? 'text-muted-foreground' : 'text-foreground',
          )}>
            {heure(i.debut)}
          </span>
          <span className="mt-1 text-[11px] tabular leading-none text-faint">
            {heure(i.fin)}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          {/* Sans `flex-wrap` et avec un titre borne a deux lignes : un
              libelle long poussait la pastille de statut sous le texte, au
              milieu de la carte, ou elle ne se rattachait plus a rien. */}
          <span className="flex items-start gap-2">
            <span className={cn(
              'line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-foreground',
              annulee && 'line-through',
            )}>
              {i.client || i.titre}
            </span>
            <span className={cn(
              'mt-px shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              PASTILLE_STATUT_RDV[i.statut],
            )}>
              {LIBELLE_STATUT_RDV[i.statut]}
            </span>
          </span>

          {i.client && i.titre !== i.client && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{i.titre}</span>
          )}

          {(i.vehicule || i.immatriculation) && (
            <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Car className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">
                {i.vehicule || 'Véhicule'}
                {i.immatriculation ? ` · ${i.immatriculation}` : ''}
              </span>
            </span>
          )}


          {i.adresse ? (
            <span className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span className="min-w-0">{i.adresse}</span>
            </span>
          ) : (
            <span className="mt-1.5 flex items-center gap-1.5 text-xs text-due">
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
              Aucune adresse sur ce rendez-vous
            </span>
          )}

          {i.geo_precision === 'approximatif' && (
            <span className="mt-1 block text-[11px] text-due">
              Point au centre de la commune : vérifiez l’adresse avant de partir.
            </span>
          )}

          {!terminee && !annulee && (
            <InterventionWeather
              compact
              startTime={i.debut}
              ville={i.ville}
              codePostal={i.codePostal}
              citycode={i.citycode}
              latitude={i.latitude}
              longitude={i.longitude}
            />
          )}
        </span>

        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-faint" aria-hidden />
      </button>

      {/* Les gestes du terrain. Separes du corps cliquable : taper « Appeler »
          ne doit pas ouvrir la fiche par-dessus l'appel. */}
      <div className="flex items-stretch gap-px border-t border-border bg-border">
        <Action
          href={i.telephone ? `tel:${i.telephone}` : undefined}
          icone={Phone}
          libelle="Appeler"
          indisponible="Aucun numéro"
        />
        <Action
          href={itineraire ?? undefined}
          icone={Navigation}
          libelle="Itinéraire"
          indisponible="Lieu inconnu"
          externe
        />
        {aMoi && onTerminer && !terminee && !annulee && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-none rounded-br-xl bg-card text-xs font-medium text-done hover:bg-done-soft"
            onClick={onTerminer}
            disabled={changementEnCours}
          >
            Terminée
          </Button>
        )}
      </div>
    </article>
  );
}

/**
 * Une action, ou la raison de son absence.
 *
 * Un bouton grise sans explication laisse croire a une panne. Dire « Aucun
 * numéro » coute la meme place et repond a la question.
 */
function Action({ href, icone: Icone, libelle, indisponible, externe }: {
  href?: string;
  icone: typeof Phone;
  libelle: string;
  indisponible: string;
  externe?: boolean;
}) {
  const classes = 'flex h-11 flex-1 items-center justify-center gap-1.5 bg-card text-xs font-medium transition-colors';

  if (!href) {
    return (
      <span className={cn(classes, 'cursor-default text-faint')}>
        <Icone className="h-3.5 w-3.5" aria-hidden />
        {indisponible}
      </span>
    );
  }

  return (
    <a
      href={href}
      {...(externe ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={cn(classes, 'text-foreground hover:bg-surface active:bg-surface')}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden />
      {libelle}
    </a>
  );
}
