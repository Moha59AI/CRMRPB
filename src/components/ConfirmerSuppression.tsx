import { type ReactNode } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * Confirmation avant une suppression.
 *
 * Le nom de l'élément est repris dans la question : « Supprimer ? » ne
 * permet pas de vérifier qu'on a cliqué sur la bonne ligne, ce qui est
 * précisément le moment où l'on se trompe.
 *
 * `alternative` sert à proposer la désactivation quand elle existe : sur un
 * webhook ou un scénario, désactiver rend le même service et se rattrape.
 */
interface ConfirmerSuppressionProps {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  /** Nom exact de l'élément visé. */
  nom: string;
  /** Ce que la suppression entraîne réellement. */
  consequence?: string;
  enCours?: boolean;
  onConfirmer: () => void;
  alternative?: ReactNode;
  libelleAction?: string;
}

export function ConfirmerSuppression({
  ouvert, onOuvertChange, nom, consequence, enCours,
  onConfirmer, alternative, libelleAction = 'Supprimer définitivement',
}: ConfirmerSuppressionProps) {
  return (
    <AlertDialog open={ouvert} onOpenChange={onOuvertChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <AlertDialogTitle>Supprimer « {nom} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            {consequence ?? 'Cette action est définitive et ne peut pas être annulée.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {alternative && (
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {alternative}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmer}
            disabled={enCours}
            className={cn(
              'rounded-full bg-destructive text-destructive-foreground',
              'hover:bg-destructive/90'
            )}
          >
            {enCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {libelleAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
