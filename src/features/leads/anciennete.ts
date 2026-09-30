// Depuis combien de temps ce lead attend
//
// Le CRM affichait un score : `leads.score`, jamais calcule nulle part, egal
// a 0 sur les 568 leads de la base. Une colonne de tableau, un badge sur
// chaque carte et une ligne sur chaque fiche, pour une valeur constante.
//
// Ce qui manquait a la place, c'est l'attente. 45 des 59 leads « nouveaux »
// patientent depuis plus de 48 heures, et rien ne les distinguait de celui
// arrive ce matin. En bris de glace, un lead qui dort perd sa valeur en
// quelques heures : le prospect appelle le concurrent.
//
// L'echelle reprend celle des relances -- urgent / a faire / a venir /
// traite -- pour qu'une file de leads se lise comme une file de relances,
// sans reapprendre un code couleur.

import type { Lead, LeadStatus } from '@/types';

export type NiveauAttente = 'traite' | 'recent' | 'a_relancer' | 'urgent';

export interface Attente {
  /** Heures ecoulees depuis l'arrivee du prospect. */
  heures: number;
  niveau: NiveauAttente;
  /** « 3 h », « 2 j », « 5 sem. » */
  libelle: string;
}

/**
 * Statuts ou l'attente ne veut plus rien dire.
 *
 * Un rendez-vous est pris, le dossier est gagne ou perdu : le temps qui
 * passe n'appelle plus d'action. Les colorer en rouge noierait les leads
 * qu'il faut vraiment rappeler.
 */
const STATUTS_AU_REPOS: readonly LeadStatus[] = [
  'appointment_scheduled', 'converted', 'lost', 'documents_received',
];

const HEURE = 3_600_000;

export function libelleDuree(heures: number): string {
  if (heures < 1) return "moins d'1 h";
  if (heures < 24) return `${Math.floor(heures)} h`;
  const jours = Math.floor(heures / 24);
  if (jours < 14) return `${jours} j`;
  return `${Math.floor(jours / 7)} sem.`;
}

export function attenteDuLead(
  lead: Pick<Lead, 'status' | 'arrive_le' | 'received_at' | 'created_at'>,
  maintenant = Date.now(),
): Attente {
  const reference = lead.arrive_le || lead.received_at || lead.created_at;
  const depart = reference ? new Date(reference).getTime() : Number.NaN;
  const heures = Number.isFinite(depart) ? Math.max(0, (maintenant - depart) / HEURE) : 0;
  const libelle = libelleDuree(heures);

  if (STATUTS_AU_REPOS.includes(lead.status)) return { heures, niveau: 'traite', libelle };
  // 4 h : le temps qu'un conseiller finisse sa matinee. 48 h : le delai
  // au-dela duquel un lead de bris de glace ne se rattrape plus.
  if (heures >= 48) return { heures, niveau: 'urgent', libelle };
  if (heures >= 4) return { heures, niveau: 'a_relancer', libelle };
  return { heures, niveau: 'recent', libelle };
}

/** Teintes de l'echelle d'urgence, deja definies dans `index.css`. */
export const COULEUR_ATTENTE: Record<NiveauAttente, string> = {
  urgent: 'border-urgent/25 bg-urgent-soft text-urgent',
  a_relancer: 'border-due/25 bg-due-soft text-due',
  recent: 'border-upcoming/25 bg-upcoming-soft text-upcoming',
  traite: 'border-border bg-surface text-muted-foreground',
};

export const LIBELLE_NIVEAU: Record<NiveauAttente, string> = {
  urgent: 'Sans réponse depuis plus de 48 h',
  a_relancer: 'À rappeler aujourd’hui',
  recent: 'Arrivé il y a moins de 4 h',
  traite: 'Pris en charge',
};
