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
  const parcours = leadJourneyStages.filter((e) => !e.terminal);
  const sorties = leadJourneyStages.filter((e) => e.terminal);
  const indexCourant = parcours.findIndex((e) => e.key === etapeCourante.key);

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
      <div className="rounded-xl border border-border bg-card px-3 py-2.5">
        {/* Les sept etapes etaient sept boites en `flex-1`, etirees sur toute
            la largeur : sur un grand ecran, 200 px de vide chacune pour un
            libelle de huit caracteres. Elles prennent desormais la place de
            leur texte, et le parcours se lit comme un fil. */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {parcours.map((etape, index) => {
            const active = etape.key === etapeCourante.key;
            const franchie = index < indexCourant;
            return (
              <div key={etape.key} className="flex shrink-0 items-center">
                {index > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      'h-px w-3 shrink-0',
                      franchie || active ? 'bg-primary/40' : 'bg-border',
                    )}
                  />
                )}
                <button
                  type="button"
                  disabled={desactive || active}
                  onClick={() => demanderChangement(etape)}
                  title={active ? `${etape.label} — étape actuelle` : `Passer à « ${etape.label} »`}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary/35 bg-primary/10 text-foreground'
                      : franchie
                        ? 'border-transparent bg-surface text-muted-foreground hover:bg-muted'
                        : 'border-transparent text-faint hover:bg-surface hover:text-muted-foreground',
                    'disabled:cursor-default disabled:opacity-100',
                  )}
                >
                  {(active || franchie) && (
                    <Check
                      aria-hidden
                      className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground/60')}
                    />
                  )}
                  {etape.label}
                </button>
              </div>
            );
          })}

          {/* Perdu et Cloture sortent le lead du travail actif : ils ne font
              pas partie du fil, ils le terminent. */}
          {sorties.length > 0 && (
            <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-border" />
          )}
          {sorties.map((etape) => {
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
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors',
                  active
                    ? 'border-urgent/30 bg-urgent-soft text-urgent'
                    : 'border-border text-muted-foreground hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive',
                  'disabled:cursor-default disabled:opacity-100',
                )}
              >
                {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {etape.label}
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
