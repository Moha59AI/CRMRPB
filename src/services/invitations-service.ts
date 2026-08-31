// Invitations d'acces
//
// Un compte authentifie ne donne acces a rien par lui-meme : seul un profil
// rattache a un espace le fait, et un profil n'est cree que par le trigger
// handle_new_user, s'il trouve une invitation valide. Toute la verification
// vit donc en base -- ce fichier ne fait qu'appeler.

import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

export interface Invitation {
  id: string;
  workspace_id: string;
  email: string;
  role: UserRole;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export async function fetchInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Invitation[];
}

/**
 * Cree ou prolonge une invitation.
 *
 * La fonction SQL verifie que l'appelant est administrateur : le masquage du
 * bouton cote interface n'est pas une securite.
 */
export async function creerInvitation(email: string, role: UserRole): Promise<string> {
  const { data, error } = await supabase.rpc('creer_invitation', {
    p_email: email,
    p_role: role,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export async function annulerInvitation(id: string): Promise<void> {
  const { error } = await supabase.from('invitations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
