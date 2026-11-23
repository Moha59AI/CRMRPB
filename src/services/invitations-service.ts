// Invitations d'acces
//
// Un compte authentifie ne donne acces a rien par lui-meme : seul un profil
// rattache a un espace le fait. La fonction Edge reservee aux administrateurs
// cree cet acces et envoie le lien personnel depuis la boite IONOS.

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

export interface InvitationEnvoyee {
  invitation_id: string;
  user_id: string;
  email: string;
  message_id: string | null;
  mode: 'invitation' | 'password';
}

const erreursInvitation: Record<string, string> = {
  UNAUTHORIZED: 'Votre session a expiré. Reconnectez-vous avant de réessayer.',
  FORBIDDEN: 'Seul un administrateur peut inviter un utilisateur.',
  EMAIL_INVALIDE: "L'adresse email est invalide.",
  ROLE_INVALIDE: "Le rôle sélectionné n'est pas reconnu.",
  MODE_CREATION_INVALIDE: "Le mode de création du compte n'est pas reconnu.",
  MOT_DE_PASSE_TROP_FAIBLE: 'Utilisez au moins 12 caractères avec une majuscule, une minuscule, un chiffre et un symbole.',
  UTILISATEUR_INTROUVABLE: "Ce compte utilisateur est introuvable.",
  BOITE_IONOS_NON_CONFIGUREE: "Configurez d'abord la boîte mail IONOS dans les réglages.",
  MOT_DE_PASSE_IONOS_ABSENT: 'Le mot de passe IONOS doit être enregistré dans les réglages.',
  UTILISATEUR_DEJA_MEMBRE: 'Cette personne fait déjà partie de votre espace.',
  UTILISATEUR_DEJA_RATTACHE: 'Ce compte est déjà rattaché à un autre espace.',
  IONOS_A_REFUSE_LE_DESTINATAIRE: "IONOS a refusé l'adresse du destinataire.",
  ENVOI_INVITATION_IMPOSSIBLE: "L'email d'invitation n'a pas pu être envoyé. Aucun accès n'a été créé.",
};

function erreurInvitation(message: string): string {
  return erreursInvitation[message] ?? message;
}

/**
 * Cree l'acces, genere le lien de choix du mot de passe et l'envoie par IONOS.
 * La fonction Edge controle elle-meme le role administrateur et annule le
 * compte cree si le serveur SMTP refuse le message.
 */
type CorpsInvitation =
  | { email: string; role: UserRole; mode: 'invitation' }
  | { email: string; role: UserRole; mode: 'password'; password: string }
  | { user_id: string };

async function envoyerInvitation(body: CorpsInvitation): Promise<InvitationEnvoyee> {
  const { data, error } = await supabase.functions.invoke<InvitationEnvoyee & {
    success?: boolean;
    error?: string;
  }>('user-invite', {
    body,
  });

  if (error) {
    let message = error.message;
    const response = (error as { context?: Response }).context;
    if (response) {
      const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) message = payload.error;
    }
    throw new Error(erreurInvitation(message));
  }
  if (!data?.invitation_id || !data.user_id || !data.email || !data.mode) {
    throw new Error(erreurInvitation(data?.error || "Le serveur n'a pas confirmé la création de l'accès"));
  }
  if (data.mode === 'invitation' && !data.message_id) {
    throw new Error("Le serveur n'a pas confirmé l'envoi de l'invitation");
  }
  return data;
}

export async function creerInvitation(email: string, role: UserRole): Promise<InvitationEnvoyee> {
  return envoyerInvitation({ email: email.trim().toLowerCase(), role, mode: 'invitation' });
}

/**
 * Cree un compte immediatement actif avec le mot de passe initial choisi par
 * l'administrateur. Le mot de passe traverse uniquement l'appel HTTPS vers la
 * fonction Edge et n'est jamais renvoye au navigateur ni stocke dans le CRM.
 */
export async function creerAccesAvecMotDePasse(
  email: string,
  role: UserRole,
  password: string,
): Promise<InvitationEnvoyee> {
  return envoyerInvitation({
    email: email.trim().toLowerCase(),
    role,
    mode: 'password',
    password,
  });
}

/** Renvoie l'acces d'un membre cree qui n'a pas encore finalise sa connexion. */
export async function renvoyerInvitationMembre(userId: string): Promise<InvitationEnvoyee> {
  return envoyerInvitation({ user_id: userId });
}

export async function annulerInvitation(id: string): Promise<void> {
  const { error } = await supabase.from('invitations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
