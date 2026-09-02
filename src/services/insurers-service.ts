// Assureurs
//
// La verification des droits vit dans les politiques RLS : lecture pour les
// quatre roles metier, ecriture pour l'administrateur et le responsable,
// suppression pour l'administrateur seul. Ce fichier ne fait qu'appeler.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { Insurer } from '@/types';

/** Champs modifiables. `id` et `workspace_id` n'en font pas partie. */
export type SaisieAssureur = Pick<
  Insurer,
  'name' | 'phone' | 'email' | 'address' | 'claims_phone' | 'claims_email'
  | 'agreement_number' | 'default_franchise' | 'franchise_texte' | 'notes' | 'actif'
  | 'avant_rdv' | 'jour_rdv' | 'apres_rdv' | 'client_present' | 'expertise_obligatoire'
>;

export const ASSUREUR_VIDE: SaisieAssureur = {
  name: '',
  phone: null,
  email: null,
  address: null,
  claims_phone: null,
  claims_email: null,
  agreement_number: null,
  default_franchise: null,
  franchise_texte: null,
  notes: null,
  actif: true,
  avant_rdv: null,
  jour_rdv: null,
  apres_rdv: null,
  client_present: false,
  expertise_obligatoire: false,
};

export async function fetchInsurers(options: { inclureInactifs?: boolean } = {}): Promise<Insurer[]> {
  let requete = supabase.from('insurers').select('*').order('name', { ascending: true });
  if (!options.inclureInactifs) requete = requete.eq('actif', true);

  const { data, error } = await requete;
  if (error) throw new Error(error.message);
  return (data as Insurer[]) ?? [];
}

/**
 * Un nom deja pris remonte comme un message lisible plutot qu'une violation
 * de contrainte : l'index unique est un garde-fou, pas un message d'erreur.
 */
function traduire(message: string): string {
  if (message.includes('insurers_nom_unique')) {
    return 'Un assureur porte déjà ce nom.';
  }
  return message;
}

export async function creerAssureur(saisie: SaisieAssureur): Promise<Insurer> {
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from('insurers')
    .insert({ ...saisie, workspace_id: workspaceId })
    .select('*')
    .single();

  if (error) throw new Error(traduire(error.message));
  return data as Insurer;
}

export async function modifierAssureur(
  id: string,
  saisie: Partial<SaisieAssureur>,
): Promise<void> {
  const { error } = await supabase
    .from('insurers')
    .update({ ...saisie, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(traduire(error.message));
}

/**
 * Suppression definitive.
 *
 * A n'utiliser que sur un assureur cree par erreur : les dossiers qui le
 * referencent perdraient l'information. Pour cesser de le proposer, passer
 * `actif` a false.
 */
export async function supprimerAssureur(id: string): Promise<void> {
  const { error } = await supabase.from('insurers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Combien de dossiers referencent cet assureur, pour prevenir avant suppression. */
export async function compterDossiersAssureur(id: string): Promise<number> {
  const { count, error } = await supabase
    .from('windscreen_cases')
    .select('id', { count: 'exact', head: true })
    .eq('insurer_id', id);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Retrouve la compagnie a partir du texte libre de `leads.insurance`.
 *
 * L'appariement se fait en base, sur les variantes de nom : « credit mutuel »
 * mene a Constatel, « direct assurance » a Avanssur. Le faire cote navigateur
 * imposerait de charger les 51 compagnies pour en trouver une.
 */
export async function trouverAssureur(recherche: string): Promise<Insurer | null> {
  const terme = recherche.trim();
  if (!terme) return null;

  const { data, error } = await supabase.rpc('trouver_assureur', { p_recherche: terme });
  if (error) throw new Error(error.message);

  const trouves = (data ?? []) as Insurer[];
  return trouves[0] ?? null;
}

