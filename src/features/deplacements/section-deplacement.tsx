// L'encart « Déplacement » d'une fiche
//
// Une question, une réponse : combien coûte d'aller là-bas. Le total passe en
// premier et en grand — c'est lui qui change une décision ; le détail est en
// dessous, pour qui veut vérifier d'où il sort.
//
// Sur téléphone, seuls trois chiffres sont visibles d'emblée : distance
// aller-retour, temps aller-retour, coût total. Le reste s'ouvre. Un
// technicien qui regarde sa tournée dans la rue n'a pas besoin du prix du
// litre.
//
// Rien de ce qui est affiché ici ne conditionne le reste de la fiche. Quand
// OpenRouteService ne répond pas, l'encart le dit et la fiche continue.

import { useState } from 'react';
import {
  AlertCircle, ChevronDown, Clock, Fuel, Loader2, MapPin, Navigation,
  RefreshCw, Route, UserRound, Car,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CarteTrajet } from './carte-trajet';
import {
  calculerCouts, formatDistance, formatDuree, formatEuros,
  type BaremeDeplacement,
} from './cout-trajet';
import {
  MESSAGE_BLOCAGE, useTrajet,
  type DestinationTrajet, type EtatTrajet,
} from './use-trajet';

export interface SectionDeplacementProps {
  destination: DestinationTrajet | null;
  /** Adresse d'arrivée en toutes lettres, pour l'en-tête et la carte. */
  adresseArrivee: string | null;
  /** Masque la carte là où la place manque — colonne latérale, liste. */
  sansCarte?: boolean;
  className?: string;
}

/**
 * L'encart branché sur la base.
 *
 * Il ne fait que rassembler l'état ; tout le rendu est dans `VueDeplacement`,
 * qui ne connaît ni requête ni cache. C'est ce qui permet de la monter sur des
 * valeurs fixes pour juger l'affichage, y compris les cas rares — panne,
 * adresse non localisée — qu'on ne provoque pas à volonté sur une vraie fiche.
 */
export function SectionDeplacement({
  destination, adresseArrivee, sansCarte, className,
}: SectionDeplacementProps) {
  const etat = useTrajet(destination);

  return (
    <VueDeplacement
      {...etat}
      destination={destination}
      adresseArrivee={adresseArrivee}
      sansCarte={sansCarte}
      className={className}
    />
  );
}

export interface VueDeplacementProps extends EtatTrajet {
  destination: DestinationTrajet | null;
  adresseArrivee: string | null;
  sansCarte?: boolean;
  className?: string;
}

export function VueDeplacement({
  trajet, reglages, chargement, recalculEnCours, blocage, erreur, recalculer,
  destination, adresseArrivee, sansCarte = false, className,
}: VueDeplacementProps) {
  const [detailOuvert, setDetailOuvert] = useState(false);

  const departLabel = reglages?.depart_label
    ?? [reglages?.depart_address, reglages?.depart_postal_code, reglages?.depart_city]
      .filter(Boolean).join(' ')
    ?? null;

  const bareme: BaremeDeplacement | null = reglages ? {
    fuel_price_per_liter: reglages.fuel_price_per_liter,
    consumption_l_per_100km: reglages.consumption_l_per_100km,
    vehicle_cost_per_km: reglages.vehicle_cost_per_km,
    labour_cost_per_hour: reglages.labour_cost_per_hour,
  } : null;

  const couts = trajet && bareme
    ? calculerCouts(trajet.distance_m, trajet.duration_s, bareme)
    : null;

  return (
    <section
      aria-labelledby="titre-deplacement"
      className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/25 px-3 py-2.5 sm:px-4">
        <Navigation className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <h3
          id="titre-deplacement"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Déplacement
        </h3>

        {trajet && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 rounded-full text-xs"
            onClick={recalculer}
            disabled={recalculEnCours}
          >
            {recalculEnCours
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Recalculer le trajet
          </Button>
        )}
      </header>

      {blocage ? (
        <Indisponible message={MESSAGE_BLOCAGE[blocage]} reglage={blocage === 'depart_absent'} />
      ) : chargement ? (
        <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground sm:px-4">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Calcul du trajet…
        </p>
      ) : erreur && !trajet ? (
        <Indisponible message={erreur} onReessayer={recalculer} enCours={recalculEnCours} />
      ) : trajet && couts ? (
        <>
          {/* L'erreur d'un recalcul ne fait pas disparaître le trajet connu :
              un chiffre d'hier vaut mieux qu'un encart vide. */}
          {erreur && (
            <p className="flex items-start gap-2 border-b border-due/20 bg-due-soft px-3 py-2 text-xs text-foreground sm:px-4">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-due" aria-hidden />
              {erreur} Le trajet affiché est le dernier calculé.
            </p>
          )}

          <Itineraire
            depart={departLabel}
            arrivee={adresseArrivee ?? trajet.arrivee_label}
          />

          {/* Les trois chiffres qui décident. Toujours visibles, y compris
              sur un écran de téléphone. */}
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
            <Chiffre
              icone={Route}
              libelle="Distance A/R"
              valeur={formatDistance(couts.distance_aller_retour_km)}
              detail={`${formatDistance(couts.distance_aller_km)} à l’aller`}
            />
            <Chiffre
              icone={Clock}
              libelle="Temps A/R"
              valeur={formatDuree(couts.temps_aller_retour_min)}
              detail={`${formatDuree(couts.temps_aller_min)} à l’aller`}
            />
            <div className="col-span-2 flex items-center justify-between gap-3 bg-primary/5 px-3 py-3 sm:col-span-1 sm:block sm:px-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Coût total
              </p>
              <p className="text-2xl font-semibold tabular leading-none text-primary sm:mt-1.5">
                {formatEuros(couts.cout_total)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDetailOuvert((ouvert) => !ouvert)}
            aria-expanded={detailOuvert}
            className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface sm:px-4"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', detailOuvert && 'rotate-180')}
              aria-hidden
            />
            {detailOuvert ? 'Masquer le détail' : 'Détail du coût'}
          </button>

          {detailOuvert && (
            <dl className="divide-y divide-border border-t border-border">
              <Ligne
                icone={Fuel}
                libelle="Carburant"
                precision={`${couts.litres.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L à ${bareme?.fuel_price_per_liter.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/L`}
                montant={couts.cout_carburant}
              />
              <Ligne
                icone={Car}
                libelle="Coût véhicule"
                precision={`${formatDistance(couts.distance_aller_retour_km)} à ${bareme?.vehicle_cost_per_km.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/km`}
                montant={couts.cout_vehicule}
              />
              <Ligne
                icone={UserRound}
                libelle="Temps salarié"
                precision={`${formatDuree(couts.temps_aller_retour_min)} à ${bareme?.labour_cost_per_hour.toLocaleString('fr-FR')} €/h`}
                montant={couts.cout_temps}
              />
              <div className="flex items-baseline justify-between gap-3 bg-primary/5 px-3 py-2.5 sm:px-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Coût total déplacement
                </dt>
                <dd className="text-base font-semibold tabular text-primary">
                  {formatEuros(couts.cout_total)}
                </dd>
              </div>
            </dl>
          )}

          {!sansCarte && reglages?.depart_latitude != null && reglages.depart_longitude != null
            && destination?.latitude != null && destination.longitude != null && (
            <CarteTrajet
              className="h-56 border-t border-border sm:h-64"
              depart={{
                latitude: reglages.depart_latitude,
                longitude: reglages.depart_longitude,
                label: departLabel,
              }}
              arrivee={{
                latitude: destination.latitude,
                longitude: destination.longitude,
                label: adresseArrivee,
              }}
              geometrie={trajet.geometry}
            />
          )}

          <p className="border-t border-border px-3 py-2 text-[11px] text-faint sm:px-4">
            Calculé le {new Date(trajet.calculated_at).toLocaleString('fr-FR', {
              day: '2-digit', month: '2-digit', year: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
            {trajet.geometry ? '' : ' — tracé indisponible'}
          </p>
        </>
      ) : null}
    </section>
  );
}

function Itineraire({ depart, arrivee }: { depart: string | null; arrivee: string | null }) {
  return (
    <div className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-2 sm:px-4">
      <div className="flex min-w-0 items-start gap-2">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Départ</p>
          <p className="truncate text-foreground">{depart || 'Non renseigné'}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Destination</p>
          <p className="truncate text-foreground">{arrivee || 'Adresse du client'}</p>
        </div>
      </div>
    </div>
  );
}

function Chiffre({ icone: Icone, libelle, valeur, detail }: {
  icone: typeof Route; libelle: string; valeur: string; detail: string;
}) {
  return (
    <div className="bg-card px-3 py-3 sm:px-4">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icone className="h-3 w-3" aria-hidden />
        {libelle}
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular leading-none text-foreground">{valeur}</p>
      <p className="mt-1 text-[11px] text-faint">{detail}</p>
    </div>
  );
}

function Ligne({ icone: Icone, libelle, precision, montant }: {
  icone: typeof Fuel; libelle: string; precision: string; montant: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 sm:px-4">
      <dt className="flex min-w-0 items-baseline gap-2 text-sm text-foreground">
        <Icone className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
        <span className="truncate">
          {libelle}
          <span className="ml-1.5 text-xs text-faint">{precision}</span>
        </span>
      </dt>
      <dd className="shrink-0 text-sm tabular text-foreground">{formatEuros(montant)}</dd>
    </div>
  );
}

function Indisponible({ message, reglage, onReessayer, enCours }: {
  message: string;
  /** Le blocage se lève dans les réglages : on y mène plutôt que de le dire. */
  reglage?: boolean;
  onReessayer?: () => void;
  enCours?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="flex items-start gap-2 text-muted-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-due" aria-hidden />
        {message}
      </p>

      {reglage ? (
        <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
          <Link to="/settings/deplacements">Ouvrir les réglages</Link>
        </Button>
      ) : onReessayer ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={onReessayer}
          disabled={enCours}
        >
          {enCours
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}
