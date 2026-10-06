// Ce que coûte un déplacement
//
// Arithmétique pure : aucun appel réseau, aucun accès à la base. C'est ce qui
// permet de la vérifier sans monter le CRM, et de la rejouer quand seul le
// barème change -- recalculer un montant ne demande pas de redemander la
// route à OpenRouteService.
//
// Les montants se calculent sur les valeurs **affichées**, pas sur les mètres
// bruts. Une carte qui annonce « 36,8 km » et « 7,37 € » pour un barème de
// 0,20 €/km fait douter de tout le reste : l'utilisateur refait le calcul de
// tête et trouve 7,36. L'écart réel est de deux centimes ; la confiance perdue
// vaut davantage.

/** Barème réglé dans le CRM. Aucune de ces valeurs n'est codée en dur. */
export interface BaremeDeplacement {
  /** €/L */
  fuel_price_per_liter: number;
  /** L/100 km */
  consumption_l_per_100km: number;
  /** €/km, usure et entretien du véhicule */
  vehicle_cost_per_km: number;
  /** €/h, salaire chargé du technicien sur la route */
  labour_cost_per_hour: number;
}

export const BAREME_PAR_DEFAUT: BaremeDeplacement = {
  fuel_price_per_liter: 1.7,
  consumption_l_per_100km: 6.5,
  vehicle_cost_per_km: 0.2,
  labour_cost_per_hour: 20,
};

export interface CoutsDeplacement {
  /** km, une décimale */
  distance_aller_km: number;
  distance_aller_retour_km: number;
  /** minutes entières */
  temps_aller_min: number;
  temps_aller_retour_min: number;
  /** litres consommés sur l'aller-retour, deux décimales */
  litres: number;
  cout_carburant: number;
  cout_vehicule: number;
  cout_temps: number;
  cout_total: number;
}

function arrondir(valeur: number, decimales: number): number {
  // `Math.round(valeur * 100) / 100` tombe du mauvais côté d'un demi exact
  // (2.675 → 2.67) parce que la multiplication a déjà perdu le demi.
  // Déplacer la virgule par la notation exponentielle travaille sur la
  // représentation décimale et rend le résultat attendu.
  return Number(`${Math.round(Number(`${valeur}e${decimales}`))}e-${decimales}`);
}

/**
 * Coûts d'un aller-retour, à partir d'un aller fourni par OpenRouteService.
 *
 * `distanceM` et `dureeS` décrivent l'aller seul : c'est ce que renvoie un
 * itinéraire point à point. Le retour est supposé symétrique — doubler est
 * une approximation, mais demander deux itinéraires pour gagner quelques
 * dizaines de mètres sur un sens unique doublerait aussi les appels.
 */
export function calculerCouts(
  distanceM: number,
  dureeS: number,
  bareme: BaremeDeplacement,
): CoutsDeplacement {
  const distance_aller_km = arrondir(distanceM / 1000, 1);
  const distance_aller_retour_km = arrondir(distance_aller_km * 2, 1);

  const temps_aller_min = Math.round(dureeS / 60);
  const temps_aller_retour_min = temps_aller_min * 2;

  const litres = arrondir(
    (distance_aller_retour_km * bareme.consumption_l_per_100km) / 100,
    2,
  );

  const cout_carburant = arrondir(
    ((distance_aller_retour_km * bareme.consumption_l_per_100km) / 100)
      * bareme.fuel_price_per_liter,
    2,
  );
  const cout_vehicule = arrondir(distance_aller_retour_km * bareme.vehicle_cost_per_km, 2);
  const cout_temps = arrondir((temps_aller_retour_min / 60) * bareme.labour_cost_per_hour, 2);

  // Somme des lignes affichées, et non des valeurs brutes : le détail doit
  // s'additionner à l'écran, sinon le total paraît faux.
  const cout_total = arrondir(cout_carburant + cout_vehicule + cout_temps, 2);

  return {
    distance_aller_km,
    distance_aller_retour_km,
    temps_aller_min,
    temps_aller_retour_min,
    litres,
    cout_carburant,
    cout_vehicule,
    cout_temps,
    cout_total,
  };
}

/** Vrai quand deux barèmes donneraient le même chiffrage. */
export function memeBareme(a: BaremeDeplacement, b: BaremeDeplacement): boolean {
  return a.fuel_price_per_liter === b.fuel_price_per_liter
    && a.consumption_l_per_100km === b.consumption_l_per_100km
    && a.vehicle_cost_per_km === b.vehicle_cost_per_km
    && a.labour_cost_per_hour === b.labour_cost_per_hour;
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export function formatEuros(montant: number): string {
  return EUROS.format(montant);
}

/** « 18,4 km ». Les mètres n'ont pas de sens sur un trajet routier. */
export function formatDistance(km: number): string {
  return `${km.toLocaleString('fr-FR', {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  })} km`;
}

/**
 * « 24 min », « 1 h 12 ».
 *
 * Au-delà d'une heure, « 72 min » demande un calcul mental pour savoir si on
 * rentre avant la fermeture.
 */
export function formatDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, '0')}`;
}

/**
 * Arrondi des coordonnées pour la clé de cache.
 *
 * Cinq décimales valent environ un mètre : en deçà, la Base Adresse Nationale
 * ne distingue plus rien et refaire un trajet serait un appel pour rien.
 * Appliqué à l'écriture comme à la lecture, sans quoi la clé ne retomberait
 * jamais sur ses pieds.
 */
export function arrondirCoordonnee(valeur: number): number {
  return arrondir(valeur, 5);
}
