import { Loader2, Check, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Barre d'enregistrement, affichée seulement quand il y a quelque chose à
 * enregistrer.
 *
 * Elle vit dans le pied de la fiche : hors de la zone de défilement, donc
 * visible quel que soit l'onglet ouvert et sans avoir à remonter. Son
 * apparition là où il n'y avait rien se remarque d'elle-même.
 *
 * Le nombre — et la liste — des champs modifiés répondent à la question qu'on
 * se pose avant d'enregistrer : « qu'est-ce que j'ai touché ? ». Elle se pose
 * surtout après avoir parcouru plusieurs onglets.
 *
 * Le composant ne porte pas son propre fond ni sa bordure : le pied de
 * l'overlay les fournit déjà.
 */

interface BarreEnregistrementProps {
  nombreModifications: number;
  enCours: boolean;
  onEnregistrer: () => void;
  onAnnuler: () => void;
  /** Libellés lisibles des champs modifiés. */
  champs?: string[];
}

export function BarreEnregistrement({
  nombreModifications, enCours, onEnregistrer, onAnnuler, champs,
}: BarreEnregistrementProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {nombreModifications} modification{nombreModifications > 1 ? 's' : ''} non
          enregistrée{nombreModifications > 1 ? 's' : ''}
        </p>
        {champs && champs.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={champs.join(', ')}>
            {champs.join(', ')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button" variant="ghost" size="sm" className="rounded-full"
          onClick={onAnnuler} disabled={enCours}
        >
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
          Annuler
        </Button>
        <Button
          type="button" size="sm" className="rounded-full"
          onClick={onEnregistrer} disabled={enCours}
        >
          {enCours
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Check className="mr-1.5 h-3.5 w-3.5" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
