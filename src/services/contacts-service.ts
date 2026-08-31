// Contacts, vehicules et assureurs

import { supabase } from '@/lib/supabase';
import type { Contact, Vehicle, Insurer } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchContacts(params: { search?: string }): Promise<Contact[]> {
  let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
  if (params.search) {
    const s = params.search.trim();
    query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`);
  }
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Contact[]) ?? [];
}

export async function createContact(contact: Partial<Contact>): Promise<{ error: string | null; contact: Contact | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...contact, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, contact: null };
  return { error: null, contact: data as Contact };
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('contacts').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function fetchVehiclesForContact(contactId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('contact_id', contactId);
  if (error) throw new Error(error.message);
  return (data as Vehicle[]) ?? [];
}

export async function fetchInsurers(): Promise<Insurer[]> {
  const { data, error } = await supabase
    .from('insurers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Insurer[]) ?? [];
}

export async function createInsurer(name: string): Promise<{ error: string | null; insurer: Insurer | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('insurers')
    .insert({ name, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, insurer: null };
  return { error: null, insurer: data as Insurer };
}

// ============ WINDSCREEN_CASES ============

/**
 * Nombre d'interventions par client, depuis la vue v_clients.
 *
 * Un client est une personne, un lead une intervention : c'est cette colonne
 * qui rend le modele lisible dans la liste.
 */
export async function fetchCompteursInterventions(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('v_clients')
    .select('id, nb_interventions');

  if (error) throw new Error(error.message);

  const compteurs = new Map<string, number>();
  for (const l of (data ?? []) as { id: string; nb_interventions: number }[]) {
    compteurs.set(l.id, Number(l.nb_interventions));
  }
  return compteurs;
}
