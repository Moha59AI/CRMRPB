// Moteur de relances — accès client
//
// Le calcul (agrégation des sept sources, score de priorité, filtres, tri,
// pagination) vit dans PostgreSQL : voir la migration
// `20260830120000_relances_engine.sql`. Ce fichier ne fait qu'appeler les
// fonctions et typer leurs résultats.
//
// Rien ici ne doit recalculer une urgence ou un score : à mille relances, ce
// travail ne peut pas se faire dans le navigateur.

import { supabase } from '@/lib/supabase';
import type { LeadStatus } from '@/types';
import { createNote } from '@/services/activity-service';

export type UrgencyLevel = 'urgent' | 'due' | 'upcoming';
export type PriorityLevel = 'urgent' | 'haute' | 'normale' | 'faible';
export type RelanceKind = 'nouveau' | 'rappel' | 'documents' | 'rdv' | 'tache';

export type RelanceSort = 'priorite' | 'plus_ancien' | 'plus_recent';

export interface Relance {
  id: string;
  kind: RelanceKind;
  urgency: UrgencyLevel;
  dueAt: string;
  daysLate: number;
  /** Minutes d'attente depuis l'arrivee. Non nul uniquement sur un lead jamais appele. */
  waitingMinutes: number | null;
  score: number;
  priority: PriorityLevel;
  titre: string;
  motif: string;
  phone: string | null;
  city: string | null;
  insurance: string | null;
  vehicule: string | null;
  immatriculation: string | null;
  assignedUserId: string | null;
  leadId: string | null;
  taskId: string | null;
  appointmentId: string | null;
  caseId: string | null;
  invoiceId: string | null;
  savId: string | null;
  attemptCount: number;
  lastActionAt: string | null;
  lastActionType: string | null;
}

export interface CompteursRelances {
  total: number;
  urgent: number;
  due: number;
  upcoming: number;
  nouveau: number;
  rappel: number;
  documents: number;
  rdv: number;
  tache: number;
}

export interface FiltresRelances {
  search?: string;
  kinds?: RelanceKind[];
  urgencies?: UrgencyLevel[];
  priorities?: PriorityLevel[];
  assignedUserId?: string | null;
  city?: string | null;
  sort?: RelanceSort;
  horizonDays?: number;
  limit?: number;
  offset?: number;
}

export interface PageRelances {
  relances: Relance[];
  total: number;
}

/** Forme brute renvoyée par `fetch_relances`, en snake_case. */
interface LigneBrute {
  id: string;
  kind: RelanceKind;
  urgency: UrgencyLevel;
  due_at: string;
  days_late: number;
  waiting_minutes: number | null;
  score: number;
  priority_level: PriorityLevel;
  titre: string | null;
  motif: string | null;
  phone: string | null;
  city: string | null;
  insurance: string | null;
  vehicule: string | null;
  immatriculation: string | null;
  assigned_user_id: string | null;
  lead_id: string | null;
  task_id: string | null;
  appointment_id: string | null;
  case_id: string | null;
  invoice_id: string | null;
  sav_id: string | null;
  attempt_count: number;
  last_action_at: string | null;
  last_action_type: string | null;
  total_count: number;
}

function versRelance(l: LigneBrute): Relance {
  return {
    id: l.id,
    kind: l.kind,
    urgency: l.urgency,
    dueAt: l.due_at,
    daysLate: l.days_late,
    waitingMinutes: l.waiting_minutes,
    score: l.score,
    priority: l.priority_level,
    titre: l.titre?.trim() || l.phone || 'Sans nom',
    motif: l.motif ?? 'À reprendre',
    phone: l.phone,
    city: l.city,
    insurance: l.insurance,
    vehicule: l.vehicule,
    immatriculation: l.immatriculation,
    assignedUserId: l.assigned_user_id,
    leadId: l.lead_id,
    taskId: l.task_id,
    appointmentId: l.appointment_id,
    caseId: l.case_id,
    invoiceId: l.invoice_id,
    savId: l.sav_id,
    attemptCount: l.attempt_count,
    lastActionAt: l.last_action_at,
    lastActionType: l.last_action_type,
  };
}

export async function fetchRelances(filtres: FiltresRelances = {}): Promise<PageRelances> {
  const { data, error } = await supabase.rpc('fetch_relances', {
    p_search: filtres.search?.trim() || null,
    p_kinds: filtres.kinds?.length ? filtres.kinds : null,
    p_urgencies: filtres.urgencies?.length ? filtres.urgencies : null,
    p_priorities: filtres.priorities?.length ? filtres.priorities : null,
    p_assigned: filtres.assignedUserId ?? null,
    p_city: filtres.city ?? null,
    // Le plus recent d'abord : un prospect vitrage rappele trois semaines
    // apres a deja fait poser son pare-brise ailleurs.
    p_sort: filtres.sort ?? 'plus_recent',
    p_horizon_days: filtres.horizonDays ?? 7,
    p_limit: filtres.limit ?? 50,
    p_offset: filtres.offset ?? 0,
  });

  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as LigneBrute[];
  return {
    relances: lignes.map(versRelance),
    // total_count est calculé en fenêtre côté SQL : pas de seconde requête.
    total: lignes.length > 0 ? Number(lignes[0].total_count) : 0,
  };
}

export async function compterRelances(horizonDays = 7): Promise<CompteursRelances> {
  const { data, error } = await supabase.rpc('compter_relances', {
    p_horizon_days: horizonDays,
  });

  if (error) throw new Error(error.message);
  return data as CompteursRelances;
}

/** Repousse une relance de N jours. `next_action_at` prime ensuite sur la règle de statut. */
export async function reporterRelance(relance: Relance, jours = 1): Promise<void> {
  const cible = new Date();
  cible.setDate(cible.getDate() + jours);
  cible.setHours(9, 0, 0, 0);
  const iso = cible.toISOString();

  if (relance.taskId) {
    const { error } = await supabase.from('tasks').update({ due_at: iso }).eq('id', relance.taskId);
    if (error) throw new Error(error.message);
    return;
  }

  if (relance.leadId) {
    const { error } = await supabase
      .from('leads').update({ next_action_at: iso }).eq('id', relance.leadId);
    if (error) throw new Error(error.message);
    return;
  }

  throw new Error('Cette relance ne peut pas être reportée depuis la liste');
}

export async function marquerRelanceTraitee(relance: Relance): Promise<void> {
  if (relance.taskId) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', relance.taskId);
    if (error) throw new Error(error.message);
    return;
  }

  if (relance.appointmentId) {
    const { error } = await supabase
      .from('appointments').update({ status: 'confirmed' }).eq('id', relance.appointmentId);
    if (error) throw new Error(error.message);
    return;
  }

  if (relance.leadId) {
    // Sans échéance explicite, la règle de statut reprendrait la main au
    // prochain chargement : on repousse donc au lendemain.
    await reporterRelance(relance, 1);
    return;
  }

  throw new Error('Cette relance se traite depuis son dossier');
}

/**
 * Journalise une action sortante. Le trigger sur `communications` met à jour
 * `attempt_count` et `last_contacted_at` du lead.
 */
export async function journaliserAction(
  relance: Relance,
  type: 'call_outbound' | 'sms_outbound' | 'email_outbound',
  contenu: string
): Promise<void> {
  if (!relance.leadId) return;

  const { error } = await supabase.from('communications').insert({
    lead_id: relance.leadId,
    type,
    direction: 'outbound',
    status: type === 'call_outbound' ? 'answered' : 'sent',
    content: contenu,
  });

  if (error) throw new Error(error.message);
}

/**
 * Enregistre le resultat d'un appel.
 *
 * C'est ce qui fait avancer le lead dans la file. Sans lui, appeler
 * n'incrementait qu'un compteur de tentatives : le statut ne bougeait pas, la
 * cadence de ce statut restait a zero minute, et le lead revenait en tete
 * aussitot -- on rappelait la meme personne en boucle.
 *
 * `next_action_at` est remis a null hors du cas « rappeler plus tard » : une
 * date de rappel laissee d'une decision precedente prendrait le pas sur la
 * cadence et fausserait la file en silence.
 */
export async function enregistrerResultatAppel(params: {
  leadId: string;
  statut: LeadStatus;
  prochaineAction: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      status: params.statut,
      next_action_at: params.prochaineAction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.leadId);

  if (error) throw new Error(error.message);

  if (params.note?.trim()) {
    // On passe par createNote plutot que d'inserer ici : `notes` exige
    // `workspace_id`, faute de quoi la politique RLS refuse la ligne. Dupliquer
    // l'insertion, c'etait dupliquer l'occasion de l'oublier.
    const { error: erreurNote } = await createNote({
      lead_id: params.leadId,
      content: params.note.trim(),
    });

    if (erreurNote) {
      // Le statut est deja enregistre : le dire, sinon l'utilisateur croit que
      // rien n'a ete pris en compte et recommence.
      throw new Error(`Statut enregistré, mais la note n'a pas pu l'être : ${erreurNote}`);
    }
  }
}

