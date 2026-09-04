// Disponibilite d'un intervenant sur un creneau
//
// Rien n'empechait de planifier deux interventions au meme moment pour la
// meme personne. L'erreur ne se voyait qu'a l'ouverture de l'agenda, souvent
// le jour meme, quand les deux clients attendaient deja.
//
// Ce service repond a une question et une seule : ce creneau est-il libre ?
// Il ne bloque pas. Deux rendez-vous simultanes peuvent etre legitimes -- un
// appel pendant qu'un collegue est sur la route, deux poseurs le meme matin.
// C'est a la personne qui planifie de trancher, mais en connaissance de cause.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { AppointmentStatus, AppointmentType } from '@/types';

export interface ConflitRendezVous {
  id: string;
  titre: string;
  debut: string;
  fin: string;
  type: AppointmentType;
  statut: AppointmentStatus;
  assigned_user_id: string | null;
}

/** Statuts qui ne mobilisent plus personne : ils ne font pas conflit. */
const STATUTS_INACTIFS: AppointmentStatus[] = ['cancelled', 'no_show'];

export interface RechercheConflits {
  debut: string;
  fin: string;
  /** Sans intervenant assigne, on ne peut pas parler de conflit de personne. */
  assignedUserId?: string | null;
  /** Rendez-vous a exclure : celui qu'on est en train de deplacer. */
  ignorerId?: string;
}

/**
 * Rendez-vous qui chevauchent le creneau demande.
 *
 * Deux creneaux se chevauchent si l'un commence avant que l'autre finisse,
 * et finit apres que l'autre a commence. Le cas limite -- une intervention
 * qui finit a 10h et la suivante qui commence a 10h -- n'est pas un
 * chevauchement : les bornes sont strictes.
 */
export async function chercherConflits(
  params: RechercheConflits,
): Promise<ConflitRendezVous[]> {
  if (!params.assignedUserId || params.assignedUserId === 'all') return [];
  if (!params.debut || !params.fin) return [];
  if (new Date(params.fin) <= new Date(params.debut)) return [];

  const workspaceId = await getWorkspaceId();

  let requete = supabase
    .from('appointments')
    .select('id, title, start_time, end_time, type, status, assigned_user_id')
    .eq('workspace_id', workspaceId)
    .eq('assigned_user_id', params.assignedUserId)
    .lt('start_time', params.fin)
    .gt('end_time', params.debut)
    .not('status', 'in', `(${STATUTS_INACTIFS.join(',')})`)
    .order('start_time', { ascending: true })
    .limit(10);

  if (params.ignorerId) requete = requete.neq('id', params.ignorerId);

  const { data, error } = await requete;
  if (error) throw new Error(error.message);

  return ((data ?? []) as {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    type: AppointmentType;
    status: AppointmentStatus;
    assigned_user_id: string | null;
  }[]).map((r) => ({
    id: r.id,
    titre: r.title,
    debut: r.start_time,
    fin: r.end_time,
    type: r.type,
    statut: r.status,
    assigned_user_id: r.assigned_user_id,
  }));
}

/**
 * Rendez-vous deja poses sur la journee d'un intervenant.
 *
 * Sert a montrer le contexte pendant la saisie : voir la journee evite de
 * proposer un creneau qui oblige a traverser le departement entre deux
 * interventions.
 */
export async function journeeDe(params: {
  date: string;
  assignedUserId?: string | null;
}): Promise<ConflitRendezVous[]> {
  if (!params.assignedUserId || params.assignedUserId === 'all') return [];
  if (!params.date) return [];

  const workspaceId = await getWorkspaceId();

  const debut = new Date(`${params.date}T00:00:00`);
  const fin = new Date(`${params.date}T23:59:59`);

  const { data, error } = await supabase
    .from('appointments')
    .select('id, title, start_time, end_time, type, status, assigned_user_id')
    .eq('workspace_id', workspaceId)
    .eq('assigned_user_id', params.assignedUserId)
    .gte('start_time', debut.toISOString())
    .lte('start_time', fin.toISOString())
    .not('status', 'in', `(${STATUTS_INACTIFS.join(',')})`)
    .order('start_time', { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);

  return ((data ?? []) as {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    type: AppointmentType;
    status: AppointmentStatus;
    assigned_user_id: string | null;
  }[]).map((r) => ({
    id: r.id,
    titre: r.title,
    debut: r.start_time,
    fin: r.end_time,
    type: r.type,
    statut: r.status,
    assigned_user_id: r.assigned_user_id,
  }));
}
