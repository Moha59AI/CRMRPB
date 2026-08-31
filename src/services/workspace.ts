import { supabase } from '@/lib/supabase';

/**
 * Identifiant du workspace de l'utilisateur courant.
 *
 * Toutes les tables sont isolees par workspace_id et les politiques RLS s'y
 * appuient : chaque service doit filtrer dessus explicitement.
 */
export async function getWorkspaceId(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.workspace_id) throw new Error('No workspace found');
  return profile.workspace_id;
}
