import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export interface ImpersonationSession {
  session_id: string;
  started_at: string;
  expires_at: string;
  profile: Profile;
}
const MESSAGES: Record<string, string> = {
  'Seul un administrateur peut utiliser la delegation':
    'Seul un administrateur peut prendre la vue d’un utilisateur.',
  'Seul un administrateur peut terminer une delegation':
    'Cette délégation ne peut pas être arrêtée avec ce compte.',
  'Vous utilisez deja votre propre compte':
    'Vous utilisez déjà votre propre compte.',
  'Cet utilisateur ne fait pas partie de votre espace':
    'Cet utilisateur ne fait plus partie de votre espace.',
};

function messageLisible(message: string): string {
  const correspondance = Object.entries(MESSAGES)
    .find(([cle]) => message.includes(cle));
  return correspondance?.[1] ?? message;
}

function verifierSession(value: unknown): ImpersonationSession | null {
  if (value == null) return null;
  if (typeof value !== 'object') throw new Error('Réponse de délégation invalide');

  const session = value as Partial<ImpersonationSession>;
  if (
    typeof session.session_id !== 'string'
    || typeof session.started_at !== 'string'
    || typeof session.expires_at !== 'string'
    || !session.profile
    || typeof session.profile.id !== 'string'
    || typeof session.profile.role !== 'string'
  ) {
    throw new Error('Le serveur n’a pas confirmé la délégation');
  }
  return session as ImpersonationSession;
}

export async function fetchImpersonationActive(): Promise<ImpersonationSession | null> {
  const { data, error } = await supabase.rpc('impersonation_active');
  if (error) throw new Error(messageLisible(error.message));
  return verifierSession(data);
}

export async function demarrerImpersonation(
  targetUserId: string,
): Promise<ImpersonationSession> {
  const { data, error } = await supabase.rpc('demarrer_impersonation', {
    p_cible: targetUserId,
  });
  if (error) throw new Error(messageLisible(error.message));

  const session = verifierSession(data);
  if (!session) throw new Error('Le serveur n’a pas ouvert la délégation');
  return session;
}

export async function terminerImpersonation(): Promise<void> {
  const { error } = await supabase.rpc('terminer_impersonation');
  if (error) throw new Error(messageLisible(error.message));
}

