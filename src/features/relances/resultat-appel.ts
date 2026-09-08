import type { LeadStatus } from '@/types';

/**
 * Résultat d'un appel, et ce qu'il fait au lead.
 *
 * Sans lui, appeler n'incrémentait qu'un compteur de tentatives : le statut
 * ne bougeait pas, la cadence de ce statut restait à zéro minute, et le lead
 * revenait en tête de file aussitôt. On rappelait la même personne en boucle.
 *
 * Chaque issue dit trois choses : le nouveau statut, si le lead quitte la
 * file, et ce qu'on annonce à l'écran. Les réunir ici évite qu'une correction
 * d'un côté contredise l'autre.
 */

export type CleResultat =
  | 'sans_reponse'
  | 'rappeler'
  | 'interesse'
  | 'rdv'
  | 'documents'
  | 'cloture'
  | 'pas_interesse'
  | 'faux_numero';

export interface Resultat {
  cle: CleResultat;
  label: string;
  /** Ce que ça change, dit à l'utilisateur avant qu'il choisisse. */
  effet: string;
  statut: LeadStatus;
  /** Le lead sort de la file de relances. */
  sortDeFile: boolean;
  /** Propose de saisir un délai de rappel. */
  demandeDelai?: boolean;
  /** Rouge à l'écran : c'est une affaire qu'on abandonne. */
  negatif?: boolean;
}

export const RESULTATS: Resultat[] = [
  {
    cle: 'sans_reponse',
    label: "NRP — n'a pas répondu",
    effet: 'Rappel programmé selon la cadence NRP',
    statut: 'nrp',
    sortDeFile: false,
  },
  {
    cle: 'rappeler',
    label: 'Nouveau lead / à rappeler',
    effet: 'Revient à la date que vous choisissez',
    statut: 'to_call',
    sortDeFile: false,
    demandeDelai: true,
  },
  {
    cle: 'interesse',
    label: 'Qualifié',
    effet: 'Besoin confirmé — prochaine étape : obtenir les documents',
    statut: 'interested',
    sortDeFile: false,
  },
  {
    cle: 'documents',
    label: 'Attente documents',
    effet: 'Reste suivi jusqu’à la réception des pièces',
    statut: 'documents_requested',
    sortDeFile: false,
  },
  {
    cle: 'rdv',
    label: 'RDV pris',
    effet: 'Quitte les relances et passe à l’étape RDV pris',
    statut: 'appointment_scheduled',
    sortDeFile: true,
  },
  {
    cle: 'cloture',
    label: 'Clôturé',
    effet: 'Parcours terminé — l’intervention est réalisée',
    statut: 'converted',
    sortDeFile: true,
  },
  {
    cle: 'pas_interesse',
    label: 'Perdu — pas intéressé',
    effet: 'Quitte définitivement la file',
    statut: 'lost',
    sortDeFile: true,
    negatif: true,
  },
  {
    cle: 'faux_numero',
    label: 'Perdu — numéro invalide',
    effet: 'Quitte la file : rappeler ne servirait à rien',
    statut: 'lost',
    sortDeFile: true,
    negatif: true,
  },
];

export function resultatParCle(cle: CleResultat): Resultat {
  const r = RESULTATS.find((x) => x.cle === cle);
  if (!r) throw new Error(`Résultat inconnu : ${cle}`);
  return r;
}

/** Délais proposés pour « à rappeler plus tard ». */
export const DELAIS_RAPPEL: { label: string; heures: number }[] = [
  { label: 'Dans 1 h', heures: 1 },
  { label: 'Cet après-midi', heures: 4 },
  { label: 'Demain', heures: 24 },
  { label: 'Dans 3 jours', heures: 72 },
  { label: 'La semaine prochaine', heures: 168 },
];

export function dansNHeures(heures: number, depuis: Date = new Date()): string {
  return new Date(depuis.getTime() + heures * 3600_000).toISOString();
}
