// La barre d'outils au-dessus de la liste
//
// Gmail la garde étroite et constante : une case qui sélectionne tout, un
// bouton d'actualisation, et le compte à droite. Dès qu'une sélection
// existe, les actions groupées remplacent le reste — on ne montre pas une
// action qui ne porterait sur rien.

import { CheckCheck, Loader2, Mail, RefreshCw, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface BarreOutilsMailProps {
  /** Nombre de messages affiches dans la vue courante. */
  total: number;
  selection: number;
  /** Vrai quand tous les messages affiches sont selectionnes. */
  toutSelectionne: boolean;
  onToutSelectionner: (selectionne: boolean) => void;
  onActualiser: () => void;
  actualisation?: boolean;
  onMarquerLus: (lus: boolean) => void;
  onSuivre: () => void;
  actionEnCours?: boolean;
}

export function BarreOutilsMail({
  total, selection, toutSelectionne, onToutSelectionner,
  onActualiser, actualisation, onMarquerLus, onSuivre, actionEnCours,
}: BarreOutilsMailProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 sm:px-3">
      <label className="flex shrink-0 cursor-pointer items-center p-1.5">
        <input
          type="checkbox"
          checked={toutSelectionne && total > 0}
          // Une selection partielle n'est ni cochee ni vide : le trait
          // intermediaire dit « certains », ce qu'une case vide tairait.
          ref={(element) => {
            if (element) element.indeterminate = selection > 0 && !toutSelectionne;
          }}
          onChange={(evenement) => onToutSelectionner(evenement.target.checked)}
          className="h-4 w-4 cursor-pointer accent-primary"
          aria-label="Tout sélectionner"
          disabled={total === 0}
        />
      </label>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full"
        onClick={onActualiser}
        disabled={actualisation}
        aria-label="Actualiser la boîte"
        title="Actualiser"
      >
        {actualisation
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <RefreshCw className="h-4 w-4" />}
      </Button>

      {selection > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <Button
            type="button" variant="ghost" size="sm" className="h-8 rounded-full"
            onClick={() => onMarquerLus(true)} disabled={actionEnCours}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />Lu
          </Button>
          <Button
            type="button" variant="ghost" size="sm" className="h-8 rounded-full"
            onClick={() => onMarquerLus(false)} disabled={actionEnCours}
          >
            <Mail className="mr-1.5 h-3.5 w-3.5" />Non lu
          </Button>
          <Button
            type="button" variant="ghost" size="sm" className="h-8 rounded-full"
            onClick={onSuivre} disabled={actionEnCours}
          >
            <Star className="mr-1.5 h-3.5 w-3.5" />Suivre
          </Button>
          <span className="ml-auto shrink-0 pr-1 text-xs tabular-nums text-muted-foreground">
            {selection} sélectionné{selection > 1 ? 's' : ''}
          </span>
        </div>
      ) : (
        <span className="ml-auto shrink-0 pr-1 text-xs tabular-nums text-muted-foreground">
          {total === 0 ? 'Aucun message' : `${total} message${total > 1 ? 's' : ''}`}
        </span>
      )}
    </div>
  );
}
