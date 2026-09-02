// Notifications
//
// Un lead Meta arrive a 22 h : sans alerte, personne ne le voit avant le
// lendemain, et un prospect vitrage rappele le lendemain a souvent deja
// appele ailleurs.

import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types';

export async function fetchNotifications(limite = 30): Promise<Notification[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);
  return (data ?? []) as Notification[];
}

export async function compterNonLues(): Promise<number> {
  const { data, error } = await supabase.rpc('compter_notifications_non_lues');
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function marquerLue(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function marquerToutesLues(): Promise<number> {
  const { data, error } = await supabase.rpc('marquer_notifications_lues');
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/**
 * S'abonne aux notifications de l'utilisateur courant.
 *
 * Le filtre porte sur `user_id` cote serveur : sans lui, chaque poste
 * recevrait les notifications de toute l'equipe avant de les jeter.
 *
 * Renvoie la fonction de desabonnement — l'oublier laisserait une connexion
 * ouverte a chaque montage du composant.
 */
export function ecouterNotifications(
  userId: string,
  onNouvelle: (n: Notification) => void,
): () => void {
  const canal = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (charge) => onNouvelle(charge.new as Notification),
    )
    .subscribe();

  return () => { supabase.removeChannel(canal); };
}
