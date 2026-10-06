// Trajets et coûts de déplacement
//
// Ordre de priorité, tenu strictement :
//
// 1. les coordonnées déjà enregistrées par la Base Adresse Nationale ;
// 2. un trajet déjà calculé pour ce couple de points ;
// 3. OpenRouteService, et seulement là.
//
// Le cache se lit directement en base, pas via l'Edge Function : ouvrir une
// fiche ne doit pas réveiller une fonction serveur pour relire une ligne que
// la RLS nous laisse voir. La fonction n'intervient que lorsqu'il faut
// vraiment appeler OpenRouteService — elle seule détient la clé.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import {
  arrondirCoordonnee, calculerCouts, memeBareme,
  type BaremeDeplacement,
} from '@/features/deplacements/cout-trajet';

export type ProfilTrajet = 'driving-car' | 'driving-hgv';

export interface ReglagesDeplacement extends BaremeDeplacement {
  workspace_id: string;
  depart_label: string | null;
  depart_address: string | null;
  depart_postal_code: string | null;
  depart_city: string | null;
  depart_citycode: string | null;
  depart_latitude: number | null;
  depart_longitude: number | null;
  updated_at: string;
}

export interface Trajet {
  id: string;
  workspace_id: string;
  depart_latitude: number;
  depart_longitude: number;
  arrivee_latitude: number;
  arrivee_longitude: number;
  profile: ProfilTrajet;
  depart_label: string | null;
  arrivee_label: string | null;
  distance_m: number;
  duration_s: number;
  /** Tracé routier réel : [longitude, latitude], ordre GeoJSON. */
  geometry: [number, number][] | null;
  fuel_price_per_liter: number;
  consumption_l_per_100km: number;
  vehicle_cost_per_km: number;
  labour_cost_per_hour: number;
  fuel_cost: number;
  vehicle_cost: number;
  labour_cost: number;
  total_cost: number;
  calculated_at: string;
}

export interface PointArrivee {
  latitude: number;
  longitude: number;
  /** Libellé affichable, conservé avec le calcul. */
  label?: string | null;
}

/**
 * Pannes possibles d'un calcul de trajet.
 *
 * Un code, pas un message : la fiche décide quoi en dire, et distingue ce qui
 * se règle en cliquant à nouveau de ce qui demande un administrateur.
 */
export type CodeEchecTrajet =
  | 'NON_AUTHENTIFIE'
  | 'PROFIL_INTROUVABLE'
  | 'DEPART_NON_CONFIGURE'
  | 'COORDONNEES_MANQUANTES'
  | 'CLE_ABSENTE'
  | 'CLE_INVALIDE'
  | 'QUOTA_DEPASSE'
  | 'AUCUNE_ROUTE'
  | 'DELAI_DEPASSE'
  | 'REPONSE_INVALIDE'
  | 'SERVICE_INDISPONIBLE';

export class EchecTrajet extends Error {
  constructor(public readonly code: CodeEchecTrajet) {
    super(code);
    this.name = 'EchecTrajet';
  }
}

/**
 * Ce qu'on montre à l'utilisateur pour chaque panne.
 *
 * Aucune ne bloque quoi que ce soit : créer un client, modifier son adresse
 * ou poser un rendez-vous n'a jamais dépendu d'OpenRouteService.
 */
export const MESSAGE_ECHEC: Record<CodeEchecTrajet, string> = {
  NON_AUTHENTIFIE: 'Reconnectez-vous pour calculer le trajet.',
  PROFIL_INTROUVABLE: 'Votre compte n’est rattaché à aucun espace de travail.',
  DEPART_NON_CONFIGURE: 'Renseignez l’adresse de départ dans Réglages › Déplacements.',
  COORDONNEES_MANQUANTES: 'Cette adresse n’est pas localisée : choisissez-la dans les suggestions.',
  CLE_ABSENTE: 'Le service d’itinéraire n’est pas encore configuré par un administrateur.',
  CLE_INVALIDE: 'La clé du service d’itinéraire est refusée. Prévenez un administrateur.',
  QUOTA_DEPASSE: 'Quota d’itinéraires atteint pour aujourd’hui. Réessayez demain.',
  AUCUNE_ROUTE: 'Aucune route ne relie ces deux points.',
  DELAI_DEPASSE: 'Impossible de calculer le trajet actuellement.',
  REPONSE_INVALIDE: 'Impossible de calculer le trajet actuellement.',
  SERVICE_INDISPONIBLE: 'Impossible de calculer le trajet actuellement.',
};

function nombre(valeur: unknown): number {
  return typeof valeur === 'number' ? valeur : Number(valeur ?? 0);
}

/** Les colonnes numériques reviennent en texte depuis `numeric`. */
function versTrajet(ligne: Record<string, unknown>): Trajet {
  return {
    ...ligne,
    distance_m: nombre(ligne.distance_m),
    duration_s: nombre(ligne.duration_s),
    fuel_price_per_liter: nombre(ligne.fuel_price_per_liter),
    consumption_l_per_100km: nombre(ligne.consumption_l_per_100km),
    vehicle_cost_per_km: nombre(ligne.vehicle_cost_per_km),
    labour_cost_per_hour: nombre(ligne.labour_cost_per_hour),
    fuel_cost: nombre(ligne.fuel_cost),
    vehicle_cost: nombre(ligne.vehicle_cost),
    labour_cost: nombre(ligne.labour_cost),
    total_cost: nombre(ligne.total_cost),
  } as Trajet;
}

export async function fetchReglagesDeplacement(): Promise<ReglagesDeplacement | null> {
  const { data, error } = await supabase
    .from('travel_settings')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    fuel_price_per_liter: nombre(data.fuel_price_per_liter),
    consumption_l_per_100km: nombre(data.consumption_l_per_100km),
    vehicle_cost_per_km: nombre(data.vehicle_cost_per_km),
    labour_cost_per_hour: nombre(data.labour_cost_per_hour),
  } as ReglagesDeplacement;
}

export type MiseAJourReglages = Partial<Omit<ReglagesDeplacement, 'workspace_id' | 'updated_at'>>;

export async function enregistrerReglagesDeplacement(
  valeurs: MiseAJourReglages,
): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const { error } = await supabase
    .from('travel_settings')
    .upsert({ workspace_id: workspaceId, ...valeurs }, { onConflict: 'workspace_id' });
  if (error) throw new Error(error.message);
}

/**
 * Trajet déjà calculé pour ce couple de points, s'il existe.
 *
 * Lecture directe : pas d'appel externe, pas d'Edge Function. C'est le chemin
 * emprunté à chaque ouverture de fiche.
 */
export async function fetchTrajetEnCache(
  depart: { latitude: number; longitude: number },
  arrivee: PointArrivee,
  profil: ProfilTrajet = 'driving-car',
): Promise<Trajet | null> {
  const { data, error } = await supabase
    .from('travel_routes')
    .select('*')
    .eq('profile', profil)
    .eq('depart_latitude', arrondirCoordonnee(depart.latitude))
    .eq('depart_longitude', arrondirCoordonnee(depart.longitude))
    .eq('arrivee_latitude', arrondirCoordonnee(arrivee.latitude))
    .eq('arrivee_longitude', arrondirCoordonnee(arrivee.longitude))
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? versTrajet(data) : null;
}

/**
 * Appelle OpenRouteService via l'Edge Function.
 *
 * Le point de départ n'est pas transmis : il est lu côté serveur dans les
 * réglages. Laisser le navigateur le choisir reviendrait à offrir notre quota
 * à n'importe quelle paire de coordonnées.
 */
export async function calculerTrajet(
  arrivee: PointArrivee,
  options: { force?: boolean; profil?: ProfilTrajet } = {},
): Promise<Trajet> {
  const { data, error } = await supabase.functions.invoke('openrouteservice-route', {
    body: {
      arrivee: {
        latitude: arrivee.latitude,
        longitude: arrivee.longitude,
        label: arrivee.label ?? null,
      },
      profil: options.profil ?? 'driving-car',
      force: options.force === true,
    },
  });

  if (error) {
    // `functions.invoke` masque le corps des réponses d'erreur : le code y est,
    // mais seulement dans la réponse brute attachée à l'erreur.
    const reponse = (error as { context?: Response }).context;
    const code = reponse ? await lireCode(reponse) : null;
    throw new EchecTrajet(code ?? 'SERVICE_INDISPONIBLE');
  }

  const charge = data as { trajet?: Record<string, unknown>; code?: CodeEchecTrajet };
  if (charge?.code) throw new EchecTrajet(charge.code);
  if (!charge?.trajet) throw new EchecTrajet('REPONSE_INVALIDE');

  return versTrajet(charge.trajet);
}

async function lireCode(reponse: Response): Promise<CodeEchecTrajet | null> {
  try {
    const corps = await reponse.clone().json() as { code?: string };
    return (corps?.code as CodeEchecTrajet) ?? null;
  } catch {
    return null;
  }
}

/**
 * Remet les montants au barème courant, sans rappeler OpenRouteService.
 *
 * Changer le prix du carburant ne change pas la route. Refaire l'arithmétique
 * suffit, et c'est gratuit — rappeler le service pour cela consommerait le
 * quota sans rien apprendre.
 */
export async function rechiffrerTrajet(
  trajet: Trajet,
  bareme: BaremeDeplacement,
): Promise<Trajet> {
  if (memeBareme(trajet, bareme)) return trajet;

  const couts = calculerCouts(trajet.distance_m, trajet.duration_s, bareme);
  const miseAJour = {
    ...bareme,
    fuel_cost: couts.cout_carburant,
    vehicle_cost: couts.cout_vehicule,
    labour_cost: couts.cout_temps,
    total_cost: couts.cout_total,
  };

  const { data } = await supabase
    .from('travel_routes')
    .update(miseAJour)
    .eq('id', trajet.id)
    .select('*')
    .maybeSingle();

  // L'écriture est un confort : si elle échoue, le montant affiché reste juste.
  return data ? versTrajet(data) : { ...trajet, ...miseAJour };
}
