// Le trajet d'une intervention, et son coût
//
// Trois étapes, dans cet ordre, et on s'arrête à la première qui suffit :
//
// 1. le trajet est déjà en base pour ce couple de points — on l'affiche ;
// 2. le barème a changé depuis — on refait l'arithmétique, sans appel externe ;
// 3. rien en base — et seulement là, OpenRouteService.
//
// Rien ici ne bloque la fiche. Une panne du service d'itinéraire se raconte
// dans l'encart « Déplacement » et s'arrête là : le client se crée, l'adresse
// se modifie, le rendez-vous se pose.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EchecTrajet, MESSAGE_ECHEC,
  calculerTrajet, fetchReglagesDeplacement, fetchTrajetEnCache, rechiffrerTrajet,
  type PointArrivee, type ProfilTrajet, type ReglagesDeplacement, type Trajet,
} from '@/services/trajet-service';
import { arrondirCoordonnee, type BaremeDeplacement } from './cout-trajet';

export interface DestinationTrajet {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  /** Libellé affichable de l'adresse d'arrivée. */
  label?: string | null;
}

/** Pourquoi aucun trajet n'est calculable, quand c'est le cas. */
export type BlocageTrajet = 'depart_absent' | 'arrivee_absente';

export const MESSAGE_BLOCAGE: Record<BlocageTrajet, string> = {
  depart_absent: 'Renseignez l’adresse de départ dans Réglages › Déplacements.',
  arrivee_absente:
    'Cette adresse n’est pas localisée. Choisissez-la dans les suggestions pour obtenir le trajet.',
};

function bareme(reglages: ReglagesDeplacement): BaremeDeplacement {
  return {
    fuel_price_per_liter: reglages.fuel_price_per_liter,
    consumption_l_per_100km: reglages.consumption_l_per_100km,
    vehicle_cost_per_km: reglages.vehicle_cost_per_km,
    labour_cost_per_hour: reglages.labour_cost_per_hour,
  };
}

export function useReglagesDeplacement() {
  return useQuery({
    queryKey: ['reglages-deplacement'],
    queryFn: fetchReglagesDeplacement,
    // Un barème ne change pas pendant une session de travail.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export interface EtatTrajet {
  trajet: Trajet | null;
  reglages: ReglagesDeplacement | null;
  chargement: boolean;
  /** Un calcul forcé est en cours. */
  recalculEnCours: boolean;
  /** Ce qui empêche tout calcul, indépendamment du service d'itinéraire. */
  blocage: BlocageTrajet | null;
  /** Panne du service d'itinéraire, déjà traduite. */
  erreur: string | null;
  recalculer: () => void;
}

export function useTrajet(
  destination: DestinationTrajet | null,
  profil: ProfilTrajet = 'driving-car',
): EtatTrajet {
  const queryClient = useQueryClient();
  const reglagesQuery = useReglagesDeplacement();
  const reglages = reglagesQuery.data ?? null;

  const departLat = reglages?.depart_latitude ?? null;
  const departLon = reglages?.depart_longitude ?? null;
  const arriveeLat = destination?.latitude ?? null;
  const arriveeLon = destination?.longitude ?? null;

  const departPret = departLat != null && departLon != null;
  const arriveePrete = arriveeLat != null && arriveeLon != null;
  const calculable = departPret && arriveePrete;

  // La clé porte les coordonnées arrondies, pas l'identifiant de la fiche :
  // deux clients de la même rue partagent le trajet, et déménager un client
  // change la clé, donc invalide l'ancien calcul sans qu'on ait à y penser.
  const cle = calculable
    ? [
      'trajet', profil,
      arrondirCoordonnee(departLat), arrondirCoordonnee(departLon),
      arrondirCoordonnee(arriveeLat), arrondirCoordonnee(arriveeLon),
    ]
    : ['trajet', 'indisponible'];

  const trajetQuery = useQuery({
    queryKey: cle,
    enabled: calculable && !reglagesQuery.isLoading,
    staleTime: Infinity,
    // Un quota dépassé ou une clé refusée ne se règlent pas en réessayant
    // trois fois de suite ; ils se règlent côté administrateur.
    retry: false,
    queryFn: async (): Promise<Trajet> => {
      const depart = { latitude: departLat as number, longitude: departLon as number };
      const arrivee: PointArrivee = {
        latitude: arriveeLat as number,
        longitude: arriveeLon as number,
        label: destination?.label ?? null,
      };

      const connu = await fetchTrajetEnCache(depart, arrivee, profil);
      if (connu) {
        return reglages ? rechiffrerTrajet(connu, bareme(reglages)) : connu;
      }
      return calculerTrajet(arrivee, { profil });
    },
  });

  const recalcul = useMutation({
    mutationFn: () => calculerTrajet(
      {
        latitude: arriveeLat as number,
        longitude: arriveeLon as number,
        label: destination?.label ?? null,
      },
      { force: true, profil },
    ),
    onSuccess: (trajet) => queryClient.setQueryData(cle, trajet),
  });

  const panne = recalcul.error ?? trajetQuery.error;

  return {
    trajet: recalcul.data ?? trajetQuery.data ?? null,
    reglages,
    chargement: reglagesQuery.isLoading || trajetQuery.isLoading,
    recalculEnCours: recalcul.isPending,
    blocage: !departPret ? 'depart_absent' : !arriveePrete ? 'arrivee_absente' : null,
    erreur: panne ? traduire(panne) : null,
    recalculer: () => { if (calculable) recalcul.mutate(); },
  };
}

function traduire(erreur: unknown): string {
  if (erreur instanceof EchecTrajet) return MESSAGE_ECHEC[erreur.code];
  return MESSAGE_ECHEC.SERVICE_INDISPONIBLE;
}
