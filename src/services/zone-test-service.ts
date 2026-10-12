// Basculer vers l'espace de données fictives, et en revenir
//
// L'autorisation ne se décide pas ici : les trois fonctions SQL la vérifient
// chacune contre `acces_zone_test`. Ce service ne sert qu'à savoir quoi
// afficher. Quelqu'un qui appellerait le RPC directement avec la clé anon se
// ferait refuser côté base, et c'est là que ça compte.

import { supabase } from '@/lib/supabase';

export interface EtatZoneTest {
  /** Le compte courant figure dans la liste des autorisés. */
  autorise: boolean;
  /** L'espace de travail actif est celui des données fictives. */
  dedans: boolean;
}

export async function fetchEtatZoneTest(workspaceId: string | null): Promise<EtatZoneTest> {
  // La politique RLS ne laisse lire que sa propre ligne : une réponse vide
  // signifie « pas autorisé », sans révéler qui l'est.
  const { data: acces } = await supabase
    .from('acces_zone_test')
    .select('user_id')
    .maybeSingle();

  if (!workspaceId) return { autorise: Boolean(acces), dedans: false };

  const { data: espace } = await supabase
    .from('workspaces')
    .select('est_zone_test')
    .eq('id', workspaceId)
    .maybeSingle();

  return {
    autorise: Boolean(acces),
    dedans: Boolean(espace?.est_zone_test),
  };
}

/** Entre dans l'espace de test, en le créant au premier passage. */
export async function entrerZoneTest(): Promise<void> {
  const { error } = await supabase.rpc('basculer_zone_test', { vers_test: true });
  if (error) throw new Error(error.message);
}

export async function quitterZoneTest(): Promise<void> {
  const { error } = await supabase.rpc('basculer_zone_test', { vers_test: false });
  if (error) throw new Error(error.message);
}

/**
 * Remet les données fictives à zéro.
 *
 * Côté base, la suppression ne peut viser qu'un espace marqué `est_zone_test`.
 * L'espace réel ne porte pas ce drapeau, quelle que soit la façon d'appeler.
 */
export async function reinitialiserZoneTest(): Promise<void> {
  const { error } = await supabase.rpc('seed_zone_test');
  if (error) throw new Error(error.message);
}
