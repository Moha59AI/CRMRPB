import { useState } from 'react';
import { Eye, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { roleLabels } from '@/config/roles';
import { useAuth } from '@/features/auth/auth-context';

function nomComplet(prenom?: string | null, nom?: string | null): string {
  return [prenom, nom].filter(Boolean).join(' ') || 'Utilisateur sans nom';
}
export function ImpersonationBanner() {
  const { actorProfile, impersonation, stopImpersonation } = useAuth();
  const [ending, setEnding] = useState(false);

  if (!impersonation) return null;

  const cible = impersonation.profile;
  const acteur = nomComplet(actorProfile?.first_name, actorProfile?.last_name);
  const expiration = new Date(impersonation.expires_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const terminer = async () => {
    setEnding(true);
    try {
      await stopImpersonation();
      // Un rechargement efface toutes les listes mises en cache sous les
      // droits de la personne ciblée.
      window.location.assign('/settings/users');
    } catch (error) {
      setEnding(false);
      toast.error('Impossible de revenir à votre compte', {
        description: error instanceof Error ? error.message : 'Réessayez dans un instant.',
      });
    }
  };

  return (
    <div
      className="safe-haut z-40 shrink-0 border-b border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
      role="status"
      aria-live="polite"
      data-impersonation-banner
    >
      <div className="mx-auto flex min-h-12 max-w-[110rem] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50">
          <Eye className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold sm:text-sm">
            Vue de {nomComplet(cible.first_name, cible.last_name)}
            <span className="font-normal opacity-75"> · {roleLabels[cible.role]}</span>
          </p>
          <p className="hidden truncate text-[11px] opacity-75 sm:block">
            Connecté en tant que {acteur} · actions tracées · fin automatique à {expiration}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 rounded-full border-amber-400 bg-white/80 px-3 text-xs text-amber-950 hover:bg-white dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
          onClick={terminer}
          disabled={ending}
        >
          {ending
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Undo2 className="mr-1.5 h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Revenir à mon compte</span>
          <span className="sm:hidden">Quitter</span>
        </Button>
      </div>
    </div>
  );
}

