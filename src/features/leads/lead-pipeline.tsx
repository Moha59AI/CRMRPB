import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/types';
import {
  leadJourneyStages,
  leadStageDescription,
  leadStageForStatus,
  type LeadJourneyStage,
} from './lead-shared';

interface LeadPipelineProps {
  statut: LeadStatus;
  onChangerStatut: (statut: LeadStatus) => void;
  desactive?: boolean;
}

/**
 * Parcours commercial visible par l'equipe.
 *
 * Les dix valeurs stockees en base restent intactes pour les automatismes,
 * mais elles sont reunies en sept decisions comprehensibles. Perdu et Cloture
 * demandent une confirmation parce qu'ils retirent le lead du travail actif.
 */
export function LeadPipeline({ statut, onChangerStatut, desactive }: LeadPipelineProps) {
  const [confirmation, setConfirmation] = useState<LeadJourneyStage | null>(null);
  const etapeCourante = leadStageForStatus(statut);

  const demanderChangement = (etape: LeadJourneyStage) => {
    if (etape.key === etapeCourante.key) return;
    if (etape.terminal) {
      setConfirmation(etape);
      return;
    }
    onChangerStatut(etape.targetStatus);
  };

  const confirmer = () => {
    if (!confirmation) return;
    onChangerStatut(confirmation.targetStatus);
    setConfirmation(null);
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {leadJourneyStages.map((etape) => {
            const active = etape.key === etapeCourante.key;
            return (
              <button
                key={etape.key}
                type="button"
                disabled={desactive || active}
                onClick={() => demanderChangement(etape)}
                title={active ? `${etape.label} — étape actuelle` : `Passer à « ${etape.label} »`}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'min-h-11 min-w-[112px] flex-1 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'border-primary/35 bg-primary/10 text-foreground'
                    : etape.terminal
                      ? 'border-border bg-background text-muted-foreground hover:border-destructive/30 hover:bg-destructive/5'
                      : 'border-transparent bg-background text-muted-foreground hover:border-border hover:bg-muted/50',
                  'disabled:cursor-default disabled:opacity-100',
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  <span className="truncate">{etape.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Étape actuelle : {etapeCourante.label}</span>
            {' — '}{leadStageDescription(statut)}
          </p>
          {etapeCourante.terminal && (
            <button
              type="button"
              disabled={desactive}
              onClick={() => onChangerStatut('to_call')}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Remettre en nouveau lead
            </button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmation !== null} onOpenChange={(ouvert) => !ouvert && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.key === 'perdu' ? 'Marquer ce lead comme perdu ?' : 'Clôturer ce dossier ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.key === 'perdu'
                ? 'Le lead sortira des relances. Vous pourrez le remettre en nouveau lead si le client revient.'
                : "Utilisez Clôturé seulement lorsque l’intervention est terminée. Le dossier sortira alors du parcours actif."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={cn('rounded-full', confirmation?.key === 'perdu' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
              onClick={confirmer}
            >
              {confirmation?.key === 'perdu' ? 'Marquer perdu' : 'Clôturer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
