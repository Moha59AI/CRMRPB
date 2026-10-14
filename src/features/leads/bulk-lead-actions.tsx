import { useState } from 'react';
import { ArrowRight, CheckSquare2, Loader2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/types';
import { leadJourneyStages } from './lead-shared';

interface BulkLeadActionsProps {
  selectionCount: number;
  totalVisible: number;
  tousSelectionnes: boolean;
  statutCible: LeadStatus | '';
  enCours: boolean;
  onStatutCibleChange: (statut: LeadStatus) => void;
  onBasculerTout: () => void;
  onEffacer: () => void;
  onAppliquer: (statut: LeadStatus) => void;
}

/**
 * Barre unique pour les actions de masse.
 *
 * Elle reste volontairement separee des tableaux/cartes : chaque vue ne fait
 * que cocher des identifiants, tandis que la decision metier et sa confirmation
 * vivent ici une seule fois.
 */
export function BulkLeadActions({
  selectionCount,
  totalVisible,
  tousSelectionnes,
  statutCible,
  enCours,
  onStatutCibleChange,
  onBasculerTout,
  onEffacer,
  onAppliquer,
}: BulkLeadActionsProps) {
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const destination = leadJourneyStages.find((stage) => stage.targetStatus === statutCible);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-primary/20 bg-primary/[0.055] px-3 py-2.5 sm:flex-row sm:items-center sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CheckSquare2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {selectionCount} fiche{selectionCount > 1 ? 's' : ''} sélectionnée{selectionCount > 1 ? 's' : ''}
            </p>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={onBasculerTout}
            >
              {tousSelectionnes
                ? 'Retirer toute la sélection'
                : `Sélectionner les ${totalVisible} résultats visibles`}
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 sm:justify-end">
          <Select
            value={statutCible}
            onValueChange={(valeur) => onStatutCibleChange(valeur as LeadStatus)}
            disabled={enCours}
          >
            <SelectTrigger className="min-w-0 flex-1 rounded-lg bg-background sm:w-48 sm:flex-none">
              <SelectValue placeholder="Déplacer vers…" />
            </SelectTrigger>
            <SelectContent>
              {leadJourneyStages.filter((stage) => !stage.automated).map((stage) => (
                <SelectItem key={stage.key} value={stage.targetStatus}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            className="shrink-0 rounded-full"
            disabled={!destination || enCours}
            onClick={() => setConfirmationOuverte(true)}
          >
            {enCours
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <ArrowRight className="mr-1.5 h-4 w-4" />}
            Appliquer
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full"
            disabled={enCours}
            aria-label="Annuler la sélection"
            onClick={onEffacer}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmationOuverte} onOpenChange={setConfirmationOuverte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Déplacer {selectionCount} fiche{selectionCount > 1 ? 's' : ''} vers « {destination?.label} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les fiches sélectionnées prendront la même étape.
              {destination?.terminal
                ? ' Elles sortiront du parcours actif et des relances.'
                : ' Les actions et relances futures suivront cette nouvelle étape.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                'rounded-full',
                statutCible === 'lost' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              )}
              onClick={() => {
                if (statutCible) onAppliquer(statutCible);
              }}
            >
              Confirmer le changement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
