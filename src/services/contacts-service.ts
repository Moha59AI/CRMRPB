// Contacts et vehicules

import { supabase } from '@/lib/supabase';
import type { Contact, Vehicle, Lead, Communication, Note, Task } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

/**
 * Taille d'une page de lecture.
 *
 * Le plafond precedent -- 200 lignes, sans le dire -- coupait la liste au
 * 200e contact le plus recent. Sur 683 fiches, 94 clients sur 136 etaient
 * invisibles, et les cinq ecrans qui resolvent un nom de client le
 * cherchaient dans un tiers du carnet.
 */
const TAILLE_PAGE = 1000;
const PLAFOND_LECTURE = 20_000;

/**
 * Une recherche libre entre dans un filtre `or()` de PostgREST, dont la
 * virgule et les parentheses sont la grammaire. Les laisser passer casse la
 * requete au lieu de ne rien trouver.
 */
function rechercheSure(valeur: string): string {
  return valeur.trim().replace(/[,()*\\]/g, ' ').trim();
}

export async function fetchContacts(params: { search?: string }): Promise<Contact[]> {
  const recherche = params.search ? rechercheSure(params.search) : '';
  const tous: Contact[] = [];

  // On avance du nombre de lignes reellement recues, pas de la taille
  // demandee : PostgREST peut plafonner une reponse en dessous, et une page
  // plus courte ne signifie pas qu'on est arrive au bout.
  let debut = 0;
  while (debut < PLAFOND_LECTURE) {
    let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
    if (recherche) {
      query = query.or(
        `first_name.ilike.%${recherche}%,last_name.ilike.%${recherche}%,`
        + `phone.ilike.%${recherche}%,email.ilike.%${recherche}%,city.ilike.%${recherche}%`,
      );
    }
    const { data, error } = await query.range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);

    const page = (data as Contact[]) ?? [];
    if (page.length === 0) break;
    tous.push(...page);
    debut += page.length;
  }
  return tous;
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...contact, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Le contact n'a pas été créé");
  return data as Contact;
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<void> {
  const { error } = await supabase.from('contacts').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
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
export interface ResumeClientListe {
  nbInterventions: number;
  derniereIntervention: string | null;
  estClient: boolean;
  derniereFacture: string | null;
  nbDossiersGlass: number;
  dernierDossierGlass: string | null;
  origineClient: 'onify_glass' | 'facture' | 'onify_glass_et_facture' | null;
}

export async function fetchResumesClients(): Promise<Map<string, ResumeClientListe>> {
  type LigneResume = {
    id: string; nb_interventions: number; derniere_intervention: string | null;
    est_client: boolean; derniere_facture: string | null;
    nb_dossiers_glass: number; dernier_dossier_glass: string | null;
    origine_client: ResumeClientListe['origineClient'];
  };

  const resumes = new Map<string, ResumeClientListe>();

  // Meme lecture par pages que les contacts : un resume qui manque, et la
  // ligne affiche « prospect » pour quelqu'un qu'on facture.
  let debut = 0;
  while (debut < PLAFOND_LECTURE) {
    const { data, error } = await supabase
      .from('v_clients')
      .select('id, nb_interventions, derniere_intervention, est_client, derniere_facture, nb_dossiers_glass, dernier_dossier_glass, origine_client')
      .order('id')
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as LigneResume[];
    if (page.length === 0) break;
    for (const l of page) {
      resumes.set(l.id, {
        nbInterventions: Number(l.nb_interventions),
        derniereIntervention: l.derniere_intervention,
        estClient: Boolean(l.est_client),
        derniereFacture: l.derniere_facture,
        nbDossiersGlass: Number(l.nb_dossiers_glass),
        dernierDossierGlass: l.dernier_dossier_glass,
        origineClient: l.origine_client,
      });
    }
    debut += page.length;
  }
  return resumes;
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
  /**
   * Est client des le premier dossier Glass Onify ou la premiere facture.
   */
  est_client: boolean;
  nb_factures: number;
  premiere_facture: string | null;
  derniere_facture: string | null;
  nb_dossiers_glass: number;
  premier_dossier_glass: string | null;
  dernier_dossier_glass: string | null;
  client_depuis: string | null;
  origine_client: ResumeClientListe['origineClient'];
}

export async function fetchSyntheseClient(id: string): Promise<SyntheseClient | null> {
  const { data, error } = await supabase
    .from('v_clients')
    .select('nb_interventions, nb_converties, premiere_intervention, derniere_intervention, est_client, nb_factures, premiere_facture, derniere_facture, nb_dossiers_glass, premier_dossier_glass, dernier_dossier_glass, client_depuis, origine_client')
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

export interface SuiviClient {
  communications: Communication[];
  notes: Note[];
  taches: Task[];
}

/**
 * Historique de relation, même quand les anciennes lignes n'ont pas reçu de
 * `contact_id`. Les communications et notes créées depuis un dossier portent
 * surtout le `lead_id`; limiter la fiche au seul contact masquerait donc la
 * majorité des appels passés au client.
 */
export async function fetchSuiviClient(
  contactId: string,
  leadIds: string[],
): Promise<SuiviClient> {
  async function charger<T>(table: 'communications' | 'notes' | 'tasks'): Promise<T[]> {
    const direct = supabase.from(table).select('*').eq('contact_id', contactId);
    const parLead = leadIds.length > 0
      ? supabase.from(table).select('*').in('lead_id', leadIds)
      : Promise.resolve({ data: [], error: null });

    const [a, b] = await Promise.all([direct, parLead]);
    if (a.error) throw new Error(a.error.message);
    if (b.error) throw new Error(b.error.message);

    const uniques = new Map<string, T>();
    for (const ligne of [...(a.data ?? []), ...(b.data ?? [])] as (T & { id: string })[]) {
      uniques.set(ligne.id, ligne);
    }
    return [...uniques.values()];
  }

  const [communications, notes, taches] = await Promise.all([
    charger<Communication>('communications'),
    charger<Note>('notes'),
    charger<Task>('tasks'),
  ]);

  return { communications, notes, taches };
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
): Promise<Lead> {
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

  if (error) throw new Error(error.message);
  if (!data) throw new Error("L'intervention n'a pas été créée");
  return data as Lead;
}
