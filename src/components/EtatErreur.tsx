// L'ecran quand la donnee n'arrive pas
//
// Huit pages n'avaient aucun etat d'erreur -- dont l'agenda. Une requete qui
// echoue y laissait un ecran vide, impossible a distinguer d'une journee sans
// rendez-vous. On ne sait alors pas s'il faut appeler le client ou recharger
// la page.
//
// Le motif existait, recopie a la main sur les pages qui l'avaient. Le mettre
// en commun rend le geste disponible : c'est ce qui manquait pour que les
// autres l'aient.

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EtatErreurProps {
  /** Ce qui a echoue, du point de vue de l'utilisateur. */
  titre?: string;
  erreur?: unknown;
  onReessayer?: () => void;
  className?: string;
}

function messageLisible(erreur: unknown): string {
  if (erreur instanceof Error && erreur.message.trim()) return erreur.message;
  if (typeof erreur === 'string' && erreur.trim()) return erreur;
  return 'Vérifiez votre connexion, puis réessayez.';
}

export function EtatErreur({ titre, erreur, onReessayer, className }: EtatErreurProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center p-12 text-center', className)}
    >
      <AlertTriangle className="mb-3 h-8 w-8 text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">
        {titre ?? 'Chargement impossible'}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {messageLisible(erreur)}
      </p>
      {onReessayer && (
        <Button variant="outline" className="mt-4 rounded-full" onClick={onReessayer}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
