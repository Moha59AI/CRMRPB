// Aperçu de l'encart « Déplacement », en développement seulement
//
// L'encart ne s'atteint qu'une fois connecté, sur une fiche dont l'adresse est
// localisée. Cette page le monte sur un trajet fabriqué, dans les cas qui font
// mal : le cas nominal, l'adresse non localisée, le départ non configuré, et
// la panne du service d'itinéraire.
//
// La route n'existe pas en production.

import { CarteTrajet } from '@/features/deplacements/carte-trajet';
import { SectionDeplacement, VueDeplacement } from '@/features/deplacements/section-deplacement';
import {
  BAREME_PAR_DEFAUT, calculerCouts, formatDistance, formatDuree, formatEuros,
} from '@/features/deplacements/cout-trajet';
import type { ReglagesDeplacement, Trajet } from '@/services/trajet-service';
import type { EtatTrajet } from '@/features/deplacements/use-trajet';

// Lille (Relais Pare-Brise) → Wasquehal, et un tracé sommaire : la vraie
// géométrie vient d'OpenRouteService, celle-ci sert à juger le rendu.
const DEPART = { latitude: 50.62925, longitude: 3.05726, label: '12 Rue de Lens 59000 Lille' };
const ARRIVEE = { latitude: 50.6742, longitude: 3.1312, label: '5 Avenue de la Marne 59290 Wasquehal' };
const TRACE: [number, number][] = [
  [3.05726, 50.62925], [3.0641, 50.6334], [3.0712, 50.6389], [3.0778, 50.6421],
  [3.0869, 50.6478], [3.0954, 50.6536], [3.1058, 50.6601], [3.1157, 50.6668],
  [3.1244, 50.6712], [3.1312, 50.6742],
];

const REGLAGES = {
  workspace_id: 'apercu',
  depart_label: DEPART.label,
  depart_address: '12 Rue de Lens',
  depart_postal_code: '59000',
  depart_city: 'Lille',
  depart_citycode: '59350',
  depart_latitude: DEPART.latitude,
  depart_longitude: DEPART.longitude,
  updated_at: new Date().toISOString(),
  ...BAREME_PAR_DEFAUT,
} satisfies ReglagesDeplacement;

const TRAJET = {
  id: 'apercu',
  workspace_id: 'apercu',
  depart_latitude: DEPART.latitude,
  depart_longitude: DEPART.longitude,
  arrivee_latitude: ARRIVEE.latitude,
  arrivee_longitude: ARRIVEE.longitude,
  profile: 'driving-car',
  depart_label: DEPART.label,
  arrivee_label: ARRIVEE.label,
  distance_m: 18_400,
  duration_s: 24 * 60,
  geometry: TRACE,
  ...BAREME_PAR_DEFAUT,
  fuel_cost: 4.07,
  vehicle_cost: 7.36,
  labour_cost: 16,
  total_cost: 27.43,
  calculated_at: new Date().toISOString(),
} satisfies Trajet;

const INERTE: EtatTrajet = {
  trajet: null, reglages: REGLAGES, chargement: false, recalculEnCours: false,
  blocage: null, erreur: null, recalculer: () => {},
};

export function ApercuDeplacement() {
  const couts = calculerCouts(18_400, 24 * 60, BAREME_PAR_DEFAUT);

  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — trajet fabriqué. L’encart réel interroge la base
        et, s’il le faut, OpenRouteService.
      </p>

      <div className="gutter-x space-y-8 py-5">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Arithmétique attendue
          </h2>
          <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-border bg-card p-4 text-sm">
            <dt className="text-muted-foreground">Distance aller</dt>
            <dd className="tabular">{formatDistance(couts.distance_aller_km)}</dd>
            <dt className="text-muted-foreground">Distance A/R</dt>
            <dd className="tabular">{formatDistance(couts.distance_aller_retour_km)}</dd>
            <dt className="text-muted-foreground">Temps aller</dt>
            <dd className="tabular">{formatDuree(couts.temps_aller_min)}</dd>
            <dt className="text-muted-foreground">Temps A/R</dt>
            <dd className="tabular">{formatDuree(couts.temps_aller_retour_min)}</dd>
            <dt className="text-muted-foreground">Carburant</dt>
            <dd className="tabular">{formatEuros(couts.cout_carburant)}</dd>
            <dt className="text-muted-foreground">Coût véhicule</dt>
            <dd className="tabular">{formatEuros(couts.cout_vehicule)}</dd>
            <dt className="text-muted-foreground">Temps salarié</dt>
            <dd className="tabular">{formatEuros(couts.cout_temps)}</dd>
            <dt className="font-semibold text-primary">Coût total</dt>
            <dd className="font-semibold tabular text-primary">{formatEuros(couts.cout_total)}</dd>
          </dl>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tracé réel, cadré sur le parcours
          </h2>
          <CarteTrajet
            className="h-72 max-w-3xl overflow-hidden rounded-xl border border-border"
            depart={DEPART}
            arrivee={ARRIVEE}
            geometrie={TRACE}
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Encart rempli — le cas nominal
          </h2>
          <VueDeplacement
            {...INERTE}
            className="max-w-3xl"
            trajet={TRAJET}
            destination={ARRIVEE}
            adresseArrivee={ARRIVEE.label}
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Encart rempli — colonne étroite, sans carte
          </h2>
          <VueDeplacement
            {...INERTE}
            className="max-w-sm"
            trajet={TRAJET}
            destination={ARRIVEE}
            adresseArrivee={ARRIVEE.label}
            sansCarte
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Panne du service d’itinéraire, trajet connu conservé
          </h2>
          <VueDeplacement
            {...INERTE}
            className="max-w-3xl"
            trajet={TRAJET}
            erreur="Impossible de calculer le trajet actuellement."
            destination={ARRIVEE}
            adresseArrivee={ARRIVEE.label}
            sansCarte
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Panne, sans trajet connu
          </h2>
          <VueDeplacement
            {...INERTE}
            className="max-w-3xl"
            erreur="Quota d’itinéraires atteint pour aujourd’hui. Réessayez demain."
            destination={ARRIVEE}
            adresseArrivee={ARRIVEE.label}
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Encart branché sur la base — adresse non localisée
          </h2>
          <SectionDeplacement
            className="max-w-3xl"
            destination={{ latitude: null, longitude: null }}
            adresseArrivee="5 Avenue de la Marne 59290 Wasquehal"
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Encart branché sur la base — adresse localisée
          </h2>
          <SectionDeplacement
            className="max-w-3xl"
            destination={{ ...ARRIVEE }}
            adresseArrivee={ARRIVEE.label}
          />
        </section>
      </div>
    </div>
  );
}
