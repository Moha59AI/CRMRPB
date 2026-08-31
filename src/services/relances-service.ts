// Moteur de relances
//
// Le CRM sait déjà où en est chaque lead, mais rien ne dit *quand* le
// reprendre. Ce service comble ce vide : il applique un délai à chaque
// situation, en déduit une échéance, et agrège dans une file unique ce qui
// vivait jusqu'ici dans cinq écrans séparés.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { Lead, LeadStatus, Task, Appointment } from '@/types';

export type UrgencyLevel = 'urgent' | 'due' | 'upcoming';
export type RelanceKind = 'rappel' | 'documents' | 'rdv' | 'tache';

export interface Relance {
  id: string;
  kind: RelanceKind;
  urgency: UrgencyLevel;
  dueAt: string;
  daysLate: number;
  title: string;
  reason: string;
  phone: string | null;
  leadId: string | null;
  taskId: string | null;
  appointmentId: string | null;
}

/**
 * Délai avant reprise, par statut de lead, en jours.
 *
 * Ces valeurs sont le cœur métier du module : elles traduisent « au bout de
 * combien de temps un lead dans cet état devient un oubli ». Un NRP se
 * rappelle vite, des documents demandés laissent le client respirer deux
 * jours.
 *
 * `next_action_at`, quand il est renseigné sur le lead, prime toujours sur
 * cette table : une décision humaine explicite l'emporte sur la règle.
 */
const DELAI_PAR_STATUT: Partial<Record<LeadStatus, number>> = {
  new: 0,
  to_call: 0,
  calling: 0,
  nrp: 1,
  interested: 1,
  documents_requested: 2,
  documents_received: 0,
};

const LIBELLE_RELANCE: Partial<Record<LeadStatus, string>> = {
  new: 'Nouveau lead, jamais appelé',
  to_call: 'À appeler',
  calling: 'Appel en cours, à reprendre',
  nrp: 'N’a pas répondu',
  interested: 'Intéressé, à relancer',
  documents_requested: 'Documents demandés, sans réponse',
  documents_received: 'Documents reçus, à traiter',
};

function debutDeJournee(d: Date): Date {
  const copie = new Date(d);
  copie.setHours(0, 0, 0, 0);
  return copie;
}

function ecartEnJours(echeance: Date, reference: Date): number {
  const ms = debutDeJournee(reference).getTime() - debutDeJournee(echeance).getTime();
  return Math.round(ms / 86_400_000);
}

function niveauUrgence(echeance: Date, maintenant: Date): UrgencyLevel {
  const retard = ecartEnJours(echeance, maintenant);
  if (retard > 0) return 'urgent';
  if (retard === 0) return 'due';
  return 'upcoming';
}

function nomLead(lead: Lead): string {
  const nom = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return nom || lead.phone || 'Lead sans nom';
}

function ajouterJours(iso: string, jours: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + jours);
  return d;
}

/**
 * Échéance d'un lead : sa date d'action explicite si elle existe, sinon le
 * délai du statut appliqué à la dernière modification.
 */
function echeanceLead(lead: Lead): Date | null {
  if (lead.next_action_at) return new Date(lead.next_action_at);

  const delai = DELAI_PAR_STATUT[lead.status];
  if (delai === undefined) return null;

  return ajouterJours(lead.updated_at ?? lead.created_at, delai);
}

export interface OptionsRelances {
  /** Nombre de jours à venir inclus dans la file. Au-delà, ce n'est pas encore du travail. */
  horizonJours?: number;
}

export async function fetchRelances(options: OptionsRelances = {}): Promise<Relance[]> {
  const { horizonJours = 7 } = options;
  const workspaceId = await getWorkspaceId();
  const maintenant = new Date();
  const limite = debutDeJournee(maintenant);
  limite.setDate(limite.getDate() + horizonJours);

  const statutsSuivis = Object.keys(DELAI_PAR_STATUT) as LeadStatus[];

  const [leadsRes, tachesRes, rdvRes] = await Promise.all([
    supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('status', statutsSuivis)
      .order('updated_at', { ascending: true }),
    supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('status', ['pending', 'in_progress'])
      .not('due_at', 'is', null)
      .order('due_at', { ascending: true }),
    supabase
      .from('appointments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'scheduled')
      .gte('start_time', maintenant.toISOString())
      .order('start_time', { ascending: true }),
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (tachesRes.error) throw new Error(tachesRes.error.message);
  if (rdvRes.error) throw new Error(rdvRes.error.message);

  const relances: Relance[] = [];

  for (const lead of (leadsRes.data ?? []) as Lead[]) {
    const echeance = echeanceLead(lead);
    if (!echeance || echeance > limite) continue;

    const documents = lead.status === 'documents_requested';
    relances.push({
      id: `lead:${lead.id}`,
      kind: documents ? 'documents' : 'rappel',
      urgency: niveauUrgence(echeance, maintenant),
      dueAt: echeance.toISOString(),
      daysLate: Math.max(0, ecartEnJours(echeance, maintenant)),
      title: nomLead(lead),
      reason: LIBELLE_RELANCE[lead.status] ?? 'À reprendre',
      phone: lead.phone,
      leadId: lead.id,
      taskId: null,
      appointmentId: null,
    });
  }

  for (const tache of (tachesRes.data ?? []) as Task[]) {
    const echeance = new Date(tache.due_at as string);
    if (echeance > limite) continue;

    relances.push({
      id: `task:${tache.id}`,
      kind: 'tache',
      urgency: niveauUrgence(echeance, maintenant),
      dueAt: echeance.toISOString(),
      daysLate: Math.max(0, ecartEnJours(echeance, maintenant)),
      title: tache.title,
      reason: tache.description ?? 'Tâche à traiter',
      phone: null,
      leadId: tache.lead_id,
      taskId: tache.id,
      appointmentId: null,
    });
  }

  // Un rendez-vous se confirme la veille : au-delà, il est trop tôt pour
  // appeler, et le jour même il est trop tard pour réorganiser la tournée.
  for (const rdv of (rdvRes.data ?? []) as Appointment[]) {
    const echeance = ajouterJours(rdv.start_time, -1);
    if (echeance > limite) continue;

    relances.push({
      id: `rdv:${rdv.id}`,
      kind: 'rdv',
      urgency: niveauUrgence(echeance, maintenant),
      dueAt: echeance.toISOString(),
      daysLate: Math.max(0, ecartEnJours(echeance, maintenant)),
      title: rdv.title,
      reason: 'Rendez-vous à confirmer',
      phone: null,
      leadId: rdv.lead_id,
      taskId: null,
      appointmentId: rdv.id,
    });
  }

  const ordre: Record<UrgencyLevel, number> = { urgent: 0, due: 1, upcoming: 2 };
  return relances.sort((a, b) => {
    if (ordre[a.urgency] !== ordre[b.urgency]) return ordre[a.urgency] - ordre[b.urgency];
    return a.dueAt.localeCompare(b.dueAt);
  });
}

/** Repousse une relance de N jours en fixant explicitement `next_action_at`. */
export async function reporterRelance(relance: Relance, jours: number): Promise<void> {
  const cible = debutDeJournee(new Date());
  cible.setDate(cible.getDate() + jours);
  cible.setHours(9, 0, 0, 0);

  if (relance.taskId) {
    const { error } = await supabase
      .from('tasks')
      .update({ due_at: cible.toISOString() })
      .eq('id', relance.taskId);
    if (error) throw new Error(error.message);
    return;
  }

  if (relance.leadId) {
    const { error } = await supabase
      .from('leads')
      .update({ next_action_at: cible.toISOString() })
      .eq('id', relance.leadId);
    if (error) throw new Error(error.message);
  }
}

/** Sort la relance de la file sans changer le statut métier du lead. */
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
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', relance.appointmentId);
    if (error) throw new Error(error.message);
    return;
  }

  if (relance.leadId) {
    // Sans échéance explicite, la règle de statut reprendrait la main dès le
    // prochain chargement : on repousse donc au lendemain.
    await reporterRelance(relance, 1);
  }
}

export interface CompteursRelances {
  urgent: number;
  due: number;
  upcoming: number;
  total: number;
}

export function compterRelances(relances: Relance[]): CompteursRelances {
  return relances.reduce<CompteursRelances>(
    (acc, r) => ({ ...acc, [r.urgency]: acc[r.urgency] + 1, total: acc.total + 1 }),
    { urgent: 0, due: 0, upcoming: 0, total: 0 }
  );
}
