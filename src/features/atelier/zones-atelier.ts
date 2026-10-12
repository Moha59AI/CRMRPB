// Où se range chaque véhicule dans l'atelier
//
// Arithmétique pure : aucune dépendance à Three.js ni au DOM. La scène ne
// fait que dessiner ce que ce fichier décide, et ces décisions se vérifient
// sans monter de canvas.
//
// Les zones suivent les statuts de rendez-vous, pas ceux des dossiers
// vitrage. C'est délibéré : chaque intervention a un statut de rendez-vous,
// alors que deux interventions sur soixante portent un dossier. Classer sur
// le dossier aurait laissé l'atelier vide. Le parcours du dossier, lui, se
// lit dans le panneau latéral, là où il existe.

import type { AppointmentStatus } from '@/types';
import type { Intervention } from '@/services/interventions-service';

export type CleZone = 'a_venir' | 'en_cours' | 'termine' | 'annule';

export interface Zone {
  cle: CleZone;
  label: string;
  /** Centre de la zone au sol, en mètres. */
  centre: [number, number];
  /** Emprise au sol [largeur, profondeur], en mètres. */
  taille: [number, number];
  /** Couleur du marquage au sol. Vert, noir et blanc, comme le reste du CRM. */
  couleur: string;
}

/**
 * Trois postes alignés plus une mise à l'écart.
 *
 * L'atelier est vu de trois quarts : X va vers la droite, Z vers
 * l'observateur. Les trois zones utiles sont côte à côte pour qu'un
 * déplacement d'une zone à l'autre se lise comme un mouvement, pas comme une
 * téléportation.
 */
export const ZONES: Zone[] = [
  { cle: 'a_venir',  label: 'À venir',         centre: [-5.8, -0.4], taille: [5.2, 7.4], couleur: '#94a3b8' },
  { cle: 'en_cours', label: 'En intervention', centre: [0, -0.4],    taille: [5.2, 7.4], couleur: '#16a34a' },
  { cle: 'termine',  label: 'Terminé',         centre: [5.8, -0.4],  taille: [5.2, 7.4], couleur: '#64748b' },
  { cle: 'annule',   label: 'Annulé',          centre: [0, 6.2],     taille: [11.2, 3],  couleur: '#ef4444' },
];

/** Emprise totale de l'atelier, pour cadrer la caméra. */
export const EMPRISE: { largeur: number; profondeur: number } = (() => {
  const xs = ZONES.flatMap((z) => [z.centre[0] - z.taille[0] / 2, z.centre[0] + z.taille[0] / 2]);
  const zs = ZONES.flatMap((z) => [z.centre[1] - z.taille[1] / 2, z.centre[1] + z.taille[1] / 2]);
  return {
    largeur: Math.max(...xs) - Math.min(...xs),
    profondeur: Math.max(...zs) - Math.min(...zs),
  };
})();

export const LIBELLE_ZONE: Record<CleZone, string> =
  Object.fromEntries(ZONES.map((z) => [z.cle, z.label])) as Record<CleZone, string>;

/**
 * La zone d'une intervention.
 *
 * `completed` prime sur l'horloge : un technicien qui clôture en avance doit
 * voir la voiture passer en « Terminé » tout de suite, sans attendre l'heure
 * de fin théorique. À l'inverse, un rendez-vous dont l'heure est passée sans
 * clôture reste « En intervention » — c'est l'information utile, pas une
 * supposition de fin.
 */
export function zoneDe(
  intervention: Pick<Intervention, 'statut' | 'debut' | 'fin'>,
  maintenant: Date = new Date(),
): CleZone {
  const statut: AppointmentStatus = intervention.statut;
  if (statut === 'cancelled' || statut === 'no_show') return 'annule';
  if (statut === 'completed') return 'termine';

  const debut = new Date(intervention.debut).getTime();
  const t = maintenant.getTime();
  return t >= debut ? 'en_cours' : 'a_venir';
}

export interface PlaceVehicule {
  intervention: Intervention;
  zone: CleZone;
  /** Position au sol [x, z], en mètres. */
  position: [number, number];
  /** Rotation autour de l'axe vertical, en radians. */
  rotation: number;
}

/** Deux voitures de front dans un poste : au-delà, la profondeur prend le relais. */
const PAR_RANGEE = 2;
const PAS_X = 2.4;
const PAS_Z = 4.6;

/**
 * Place les véhicules dans leur zone.
 *
 * L'ordre est celui de la liste, qui arrive triée par heure : la première
 * intervention de la journée se trouve donc toujours au même endroit d'un
 * rafraîchissement à l'autre. Une place qui bouge sans raison annulerait
 * l'intérêt de l'animation de déplacement.
 */
export function placerVehicules(
  interventions: Intervention[],
  maintenant: Date = new Date(),
): PlaceVehicule[] {
  const compteurs: Record<string, number> = {};

  return interventions.map((intervention) => {
    const zone = zoneDe(intervention, maintenant);
    const definition = ZONES.find((z) => z.cle === zone) ?? ZONES[0];
    const rang = compteurs[zone] ?? 0;
    compteurs[zone] = rang + 1;

    const colonne = rang % PAR_RANGEE;
    const rangee = Math.floor(rang / PAR_RANGEE);
    const [cx, cz] = definition.centre;

    return {
      intervention,
      zone,
      position: [
        cx + (colonne - (PAR_RANGEE - 1) / 2) * PAS_X,
        cz + rangee * PAS_Z - definition.taille[1] / 2 + 2.3,
      ],
      // Les véhicules annulés sont tournés d'un quart de tour : rangés sur le
      // côté, pas en position de travail.
      rotation: zone === 'annule' ? Math.PI / 2 : 0,
    };
  });
}

/** Nombre de véhicules par zone, pour les compteurs de l'en-tête. */
export function compterParZone(places: PlaceVehicule[]): Record<CleZone, number> {
  const total: Record<CleZone, number> = {
    a_venir: 0, en_cours: 0, termine: 0, annule: 0,
  };
  for (const place of places) total[place.zone] += 1;
  return total;
}

/**
 * Une couleur de carrosserie stable par véhicule.
 *
 * Tirée de l'identifiant, donc identique d'un chargement à l'autre : deux
 * voitures voisines restent distinctes, et on retrouve la sienne après un
 * rafraîchissement. Teintes neutres uniquement — le vert reste au marquage
 * au sol et aux repères du CRM, pour qu'il continue de vouloir dire quelque
 * chose.
 */
const CARROSSERIES = ['#e2e8f0', '#94a3b8', '#475569', '#1e293b', '#cbd5e1'];

export function couleurCarrosserie(id: string): string {
  let somme = 0;
  for (let i = 0; i < id.length; i += 1) somme = (somme + id.charCodeAt(i)) % 997;
  return CARROSSERIES[somme % CARROSSERIES.length];
}
