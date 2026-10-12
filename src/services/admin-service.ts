// Administration de l'espace de travail
//
// Les verifications de role vivent dans les fonctions SQL, pas ici : ce
// fichier ne fait qu'appeler. Masquer un bouton evite une erreur, pas une
// intrusion -- la cle anon permet d'appeler ces RPC directement.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { UserRole } from '@/types';

// ============ ÉTAT DU SYSTÈME ============

export interface EtatMeta {
  en_attente: number;
  en_erreur: number;
  traites: number;
  traites_24h: number;
  dernier_recu: string | null;
  dernier_traite: string | null;
}

export interface EtatEquipe {
  membres: number;
  par_role: Partial<Record<UserRole, number>>;
  invitations_en_attente: number;
  invitations_expirees: number;
}

export interface EtatLeads {
  total: number;
  recus_24h: number;
  jamais_contactes: number;
  convertis: number;
}

export interface EtatCron {
  planifie: boolean | null;
  derniere_execution?: string | null;
  dernier_statut?: string | null;
  dernier_message?: string | null;
  echecs_recents?: number;
  erreur?: string;
}

export interface EtatIntegration {
  provider: string;
  nom: string;
  statut: 'connected' | 'error' | 'not_configured';
  derniere_reussite: string | null;
  derniere_erreur: string | null;
}

export interface EtatSysteme {
  meta: EtatMeta;
  equipe: EtatEquipe;
  leads: EtatLeads;
  cron: EtatCron;
  integrations: EtatIntegration[];
  genere_a: string;
}

export async function fetchEtatSysteme(): Promise<EtatSysteme> {
  const { data, error } = await supabase.rpc('etat_du_systeme');
  if (error) throw new Error(error.message);
  return data as EtatSysteme;
}

// ============ RÉGLAGES DE L'ENTREPRISE ============

export interface HoraireJour {
  jour: string;
  ouvert: boolean;
  debut: string;
  fin: string;
}

export interface ReglagesEntreprise {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  site_web: string;
  siret: string;
  zones: string[];
  horaires: HoraireJour[];
  preferences: {
    detection_doublons: boolean;
    attribution_auto: boolean;
  };
  /**
   * Objectif de CA net annuel affiche sur l'accueil. null = non renseigne.
   * Optionnel : le formulaire Reglages ne le connait pas, et il n'a pas a
   * le porter -- c'est l'accueil qui le saisit, et le service qui le preserve.
   */
  objectif_annuel?: number | null;
}

export const JOURS = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche',
] as const;

export const REGLAGES_PAR_DEFAUT: ReglagesEntreprise = {
  nom: '',
  adresse: '',
  telephone: '',
  email: '',
  site_web: '',
  siret: '',
  zones: [],
  horaires: JOURS.map((jour) => ({
    jour,
    ouvert: jour !== 'Dimanche',
    debut: jour === 'Samedi' ? '09:00' : '08:00',
    fin: jour === 'Samedi' ? '16:00' : '18:00',
  })),
  preferences: {
    detection_doublons: true,
    attribution_auto: false,
  },
  objectif_annuel: null,
};

/**
 * Fusionne avec les valeurs par defaut : un espace cree avant cette
 * fonctionnalite a un `settings` vide, et une cle ajoutee plus tard manquera
 * dans les espaces existants.
 */
function fusionner(brut: unknown, nomWorkspace: string): ReglagesEntreprise {
  const s = (brut ?? {}) as Partial<ReglagesEntreprise>;
  return {
    ...REGLAGES_PAR_DEFAUT,
    ...s,
    nom: s.nom || nomWorkspace,
    zones: Array.isArray(s.zones) ? s.zones : REGLAGES_PAR_DEFAUT.zones,
    horaires:
      Array.isArray(s.horaires) && s.horaires.length === 7
        ? s.horaires
        : REGLAGES_PAR_DEFAUT.horaires,
    preferences: { ...REGLAGES_PAR_DEFAUT.preferences, ...(s.preferences ?? {}) },
    objectif_annuel:
      typeof s.objectif_annuel === 'number' && Number.isFinite(s.objectif_annuel) && s.objectif_annuel > 0
        ? s.objectif_annuel
        : null,
  };
}

export async function fetchReglagesEntreprise(): Promise<ReglagesEntreprise> {
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from('workspaces')
    .select('name, settings')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return fusionner(data?.settings, data?.name ?? '');
}

export async function enregistrerReglagesEntreprise(
  reglages: ReglagesEntreprise,
): Promise<void> {
  const workspaceId = await getWorkspaceId();

  // On fusionne avec ce qui est deja en base : le formulaire Reglages
  // reconstruit l'objet a partir de ses seuls champs, et une cle qu'il ne
  // connait pas (objectif annuel, ou toute cle a venir) serait sinon effacee
  // a chaque enregistrement.
  const { data: actuel, error: erreurLecture } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .maybeSingle();
  if (erreurLecture) throw new Error(erreurLecture.message);

  const settings = { ...((actuel?.settings as Record<string, unknown> | null) ?? {}), ...reglages };

  // Le nom vit dans les deux : `workspaces.name` reste la source pour tout ce
  // qui affiche l'espace, `settings.nom` pour ce qui est imprime.
  const { error } = await supabase
    .from('workspaces')
    .update({ name: reglages.nom, settings, updated_at: new Date().toISOString() })
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);
}

/** Enregistre le seul objectif annuel, sans toucher au reste des reglages. */
export async function enregistrerObjectifAnnuel(objectif: number | null): Promise<void> {
  const workspaceId = await getWorkspaceId();

  const { data: actuel, error: erreurLecture } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .maybeSingle();
  if (erreurLecture) throw new Error(erreurLecture.message);

  const settings = {
    ...((actuel?.settings as Record<string, unknown> | null) ?? {}),
    objectif_annuel: objectif,
  };

  const { error } = await supabase
    .from('workspaces')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);
}

// ============ MEMBRES ============

export async function changerRoleMembre(membre: string, role: UserRole): Promise<void> {
  const { error } = await supabase.rpc('changer_role_membre', {
    p_membre: membre,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function renommerMembre(
  membre: string,
  prenom: string,
  nom: string,
): Promise<void> {
  const { error } = await supabase.rpc('renommer_membre', {
    p_membre: membre,
    p_prenom: prenom.trim(),
    p_nom: nom.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function retirerMembre(membre: string): Promise<void> {
  const { error } = await supabase.rpc('retirer_membre', { p_membre: membre });
  if (error) throw new Error(error.message);
}

// ============ JOURNAL D'AUDIT ============

export interface EntreeAudit {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function fetchJournalAudit(limite = 20): Promise<EntreeAudit[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, action, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);
  return (data ?? []) as EntreeAudit[];
}
