import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import {
  demarrerImpersonation,
  fetchImpersonationActive,
  terminerImpersonation,
  type ImpersonationSession,
} from '@/services/impersonation-service';

const CLE_SYNCHRO_IMPERSONATION = 'crm:impersonation-changed';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** Profil Auth réel. Il reste l'auteur de chaque action et de chaque audit. */
  actorProfile: Profile | null;
  /** Profil effectif utilisé pour la navigation et les permissions. */
  profile: Profile | null;
  impersonation: ImpersonationSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  startImpersonation: (targetUserId: string) => Promise<ImpersonationSession>;
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/*
  Le profil embarque la nature de son espace de travail.

  Les expérimentations ne vivent que dans l'espace de données fictives, et
  trois endroits doivent le savoir : le garde de route, la barre latérale
  et la barre d'onglets. Le lire ici, en même temps que le profil, évite
  une requête séparée dont la réponse arriverait après la première décision.
*/
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, workspaces(est_zone_test)')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error.message);
    return null;
  }
  if (!data) return null;

  const { workspaces, ...profil } = data as Record<string, unknown> & {
    workspaces?: { est_zone_test?: boolean } | null;
  };
  return {
    ...(profil as Omit<Profile, 'dans_zone_test'>),
    dans_zone_test: Boolean(workspaces?.est_zone_test),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [actorProfile, setActorProfile] = useState<Profile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationSession | null>(null);
  const [loading, setLoading] = useState(true);

  const chargerIdentites = useCallback(async (userId: string) => {
    const acteur = await fetchProfile(userId);
    let delegation: ImpersonationSession | null = null;

    // La RPC fait elle aussi la vérification serveur. Le test côté interface
    // évite simplement un appel inutile pour tous les autres rôles.
    if (acteur?.role === 'admin') {
      try {
        delegation = await fetchImpersonationActive();
      } catch (error) {
        // Une migration momentanément indisponible ne doit jamais empêcher
        // l'administrateur d'ouvrir le CRM avec son propre profil.
        console.error('Error fetching impersonation:', error);
      }
    }

    setActorProfile(acteur);
    setImpersonation(delegation);
    setProfile(delegation?.profile ?? acteur);
  }, []);

  const refreshProfile = async () => {
    if (user) await chargerIdentites(user.id);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        chargerIdentites(s.user.id).then(() => {
          if (!mounted) return;
          setLoading(false);
        });
      } else {
        setActorProfile(null);
        setImpersonation(null);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        (async () => {
          await chargerIdentites(s.user.id);
          if (!mounted) return;
          setLoading(false);
        })();
      } else {
        setActorProfile(null);
        setImpersonation(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [chargerIdentites]);

  // Une délégation modifie les règles RLS de toutes les pages ouvertes avec
  // la même session. Les autres onglets se rechargent donc immédiatement au
  // lieu de conserver une interface administrateur sur des droits délégués.
  useEffect(() => {
    const synchroniser = (event: StorageEvent) => {
      if (event.key === CLE_SYNCHRO_IMPERSONATION && event.newValue) {
        window.location.reload();
      }
    };
    window.addEventListener('storage', synchroniser);
    return () => window.removeEventListener('storage', synchroniser);
  }, []);

  // La base refuse automatiquement la délégation après l'échéance. Recharger
  // au même moment aligne l'interface et vide également les caches de listes.
  useEffect(() => {
    if (!impersonation) return undefined;
    const delai = Math.max(0, new Date(impersonation.expires_at).getTime() - Date.now() + 250);
    const minuteur = window.setTimeout(() => {
      localStorage.setItem(CLE_SYNCHRO_IMPERSONATION, String(Date.now()));
      window.location.assign('/settings/users');
    }, delai);
    return () => window.clearTimeout(minuteur);
  }, [impersonation]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (impersonation) {
      try {
        await terminerImpersonation();
        localStorage.setItem(CLE_SYNCHRO_IMPERSONATION, String(Date.now()));
      } catch (error) {
        console.error('Error stopping impersonation before sign out:', error);
      }
    }
    await supabase.auth.signOut();
    setActorProfile(null);
    setImpersonation(null);
    setProfile(null);
    setSession(null);
    setUser(null);
  };

  const startImpersonation = async (targetUserId: string) => {
    const delegation = await demarrerImpersonation(targetUserId);
    setImpersonation(delegation);
    setProfile(delegation.profile);
    localStorage.setItem(CLE_SYNCHRO_IMPERSONATION, String(Date.now()));
    return delegation;
  };

  const stopImpersonation = async () => {
    await terminerImpersonation();
    const acteur = user ? await fetchProfile(user.id) : null;
    setActorProfile(acteur);
    setProfile(acteur);
    setImpersonation(null);
    localStorage.setItem(CLE_SYNCHRO_IMPERSONATION, String(Date.now()));
  };

  const resetPassword = async (email: string) => {
    // Sans redirectTo, Supabase renvoie vers l'URL de site configuree dans le
    // projet — donc pas vers l'ecran de changement de mot de passe, et le lien
    // ne sert a rien. L'origine est lue a l'execution pour que le meme code
    // fonctionne en local et en production.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        actorProfile,
        profile,
        impersonation,
        loading,
        signIn,
        signOut,
        resetPassword,
        refreshProfile,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
