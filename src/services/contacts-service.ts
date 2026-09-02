// Contacts et vehicules

import { supabase } from '@/lib/supabase';
import type { Contact, Vehicle, Lead } from '@/types';
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

// Les assureurs vivent dans insurers-service : ils se gerent depuis les
// reglages, avec franchise habituelle, convention et ligne sinistre.
export { fetchInsurers } from '@/services/insurers-service';

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

export async function fetchContactById(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Contact) ?? null;
}

export interface SyntheseClient {
  nb_interventions: number;
  nb_converties: number;
  premiere_intervention: string | null;
  derniere_intervention: string | null;
}

export async function fetchSyntheseClient(id: string): Promise<SyntheseClient | null> {
  const { data, error } = await supabase
    .from('v_clients')
    .select('nb_interventions, nb_converties, premiere_intervention, derniere_intervention')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SyntheseClient) ?? null;
}

/** Les interventions du client, de la plus recente a la plus ancienne. */
export async function fetchInterventionsClient(contactId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('contact_id', contactId)
    .order('received_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

/**
 * Ouvre une nouvelle intervention pour un client existant.
 *
 * C'est le geste central du modele : un client peut revenir -- pare-brise en
 * janvier, lunette arriere en juillet -- et chaque intervention est un lead
 * distinct rattache au meme contact.
 *
 * Les coordonnees sont recopiees pour que la fiche soit exploitable tout de
 * suite. L'adresse aussi, y compris ses coordonnees geographiques : sans
 * elles, l'intervention n'apparaitrait pas sur la carte de l'agenda.
 */
export async function creerInterventionPourClient(
  contact: Contact,
): Promise<{ error: string | null; lead: Lead | null }> {
  const wsId = await getWorkspaceId();

  const { data, error } = await supabase
    .from('leads')
    .insert({
      workspace_id: wsId,
      contact_id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      city: contact.city,
      postal_code: contact.postal_code,
      citycode: contact.citycode,
      latitude: contact.latitude,
      longitude: contact.longitude,
      geo_precision: contact.geo_precision,
      source: 'manual',
      status: 'new',
    })
    .select('*')
    .single();

  if (error) return { error: error.message, lead: null };
  return { error: null, lead: data as Lead };
}

