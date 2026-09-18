// Rendez-vous et taches

import { supabase } from '@/lib/supabase';
import type { Appointment, Task } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

/** Ce que l'agenda a besoin de savoir du client d'un rendez-vous. */
export interface ClientRendezVous {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
}

export interface LeadRendezVous extends ClientRendezVous {
  id: string;
  intervention_address: string | null;
  intervention_postal_code: string | null;
  intervention_city: string | null;
  /** Offre ou cadeau annonce au client. Vit sur le lead : une offre par intervention. */
  offer: string | null;
}

/**
 * Rendez-vous avec son client embarque.
 *
 * L'agenda doit dire ou aller et qui appeler. L'adresse propre au rendez-vous
 * ne suffit pas : ceux repris de Google n'en ont pas, et celle d'un lead peut
 * changer apres la prise de rendez-vous. On lit donc le client a chaque fois.
 */
export interface AppointmentAvecClient extends Appointment {
  leads?: LeadRendezVous | null;
  contacts?: ClientRendezVous | null;
}

const CHAMPS_CLIENT = 'first_name, last_name, phone, address, postal_code, city';

export async function fetchAppointments(params: {
  startDate?: string;
  endDate?: string;
  assignedUserId?: string;
}): Promise<AppointmentAvecClient[]> {
  let query = supabase
    .from('appointments')
    .select(`*, leads(id, ${CHAMPS_CLIENT}, intervention_address, intervention_postal_code, intervention_city, offer), contacts(${CHAMPS_CLIENT})`)
    .order('start_time', { ascending: true });
  if (params.startDate) query = query.gte('start_time', params.startDate);
  if (params.endDate) query = query.lte('start_time', params.endDate);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as unknown as AppointmentAvecClient[]) ?? [];
}

/**
 * Ou se rend-on, et qui appelle-t-on.
 *
 * Ordre de priorite : l'adresse saisie sur le rendez-vous (voulue pour ce
 * deplacement), puis l'adresse d'intervention du lead, puis son domicile,
 * puis celui du contact. Le nom et le telephone viennent du premier client
 * connu.
 */
export function clientDuRendezVous(appt: AppointmentAvecClient): {
  nom: string | null;
  adresse: string | null;
  telephone: string | null;
  /** Offre commerciale, connue seulement quand un lead est rattache. */
  offre: string | null;
  /** Lead rattache, pour ecrire l'offre depuis l'agenda. */
  leadId: string | null;
} {
  const lead = appt.leads ?? null;
  const contact = appt.contacts ?? null;

  const joindre = (...parts: (string | null | undefined)[]) =>
    parts.map((p) => p?.trim()).filter(Boolean).join(' ') || null;

  const adresse =
    appt.address?.trim()
    || joindre(lead?.intervention_address, lead?.intervention_postal_code, lead?.intervention_city)
    || joindre(lead?.address, lead?.postal_code, lead?.city)
    || joindre(contact?.address, contact?.postal_code, contact?.city);

  const personne = lead ?? contact;
  const nom = personne ? joindre(personne.first_name, personne.last_name) : null;
  const telephone = lead?.phone?.trim() || contact?.phone?.trim() || null;

  return {
    nom, adresse, telephone,
    offre: lead?.offer?.trim() || null,
    leadId: lead?.id ?? appt.lead_id ?? null,
  };
}

export async function createAppointment(appt: Partial<Appointment>): Promise<{ error: string | null; appointment: Appointment | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appt, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, appointment: null };
  return { error: null, appointment: data as Appointment };
}

export async function updateAppointment(id: string, updates: Partial<Appointment>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appointments').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteAppointment(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function fetchTasks(params: {
  status?: string;
  assignedUserId?: string;
  leadId?: string;
  caseId?: string;
}): Promise<Task[]> {
  let query = supabase.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Task[]) ?? [];
}

export async function createTask(task: Partial<Task>): Promise<{ error: string | null; task: Task | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...task, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, task: null };
  return { error: null, task: data as Task };
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tasks').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}
