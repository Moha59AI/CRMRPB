import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/types';

/**
 * Pipeline horizontal du lead.
 *
 * Les dix statuts de `LeadStatus` ne sont pas dix étapes : `calling` et `nrp`
 * sont des états transitoires d'une même phase, `documents_requested` et
 * `documents_received` deux faces de la même attente. On les regroupe en six
 * jalons lisibles, tout en laissant choisir le statut précis.
 *
 * `lost` n'est pas une étape mais une sortie : il s'affiche à part.
 */

interface Etape {
  cle: string;
  label: string;
  statuts: LeadStatus[];
  /** Statut appliqué quand on clique sur l'étape. */
  cible: LeadStatus;
}

const ETAPES: Etape[] = [
  { cle: 'nouveau', label: 'Nouveau', statuts: ['new', 'to_call'], cible: 'to_call' },
  { cle: 'contact', label: 'En contact', statuts: ['calling', 'nrp'], cible: 'calling' },
  { cle: 'interesse', label: 'Intéressé', statuts: ['interested'], cible: 'interested' },
  {
    cle: 'documents', label: 'Documents',
    statuts: ['documents_requested', 'documents_received'], cible: 'documents_requested',
  },
  { cle: 'rdv', label: 'RDV', statuts: ['appointment_scheduled'], cible: 'appointment_scheduled' },
  { cle: 'converti', label: 'Converti', statuts: ['converted'], cible: 'converted' },
];

interface LeadPipelineProps {
  statut: LeadStatus;
  onChangerStatut: (statut: LeadStatus) => void;
  desactive?: boolean;
}

export function LeadPipeline({ statut, onChangerStatut, desactive }: LeadPipelineProps) {
  if (statut === 'lost') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-urgent-soft px-3 py-2">
        <X className="h-4 w-4 text-urgent" />
        <span className="text-sm font-medium text-urgent">Lead perdu</span>
        <button
          type="button"
          onClick={() => onChangerStatut('to_call')}
          disabled={desactive}
          className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Réactiver
        </button>
      </div>
    );
  }

  const indexCourant = ETAPES.findIndex((e) => e.statuts.includes(statut));

  return (
    <div className="flex items-center gap-1">
      {ETAPES.map((etape, i) => {
        const franchie = indexCourant > i;
        const active = indexCourant === i;

        return (
          <button
            key={etape.cle}
            type="button"
            disabled={desactive}
            onClick={() => onChangerStatut(etape.cible)}
            title={`Passer à « ${etape.label} »`}
            className={cn(
              'group flex min-w-0 flex-1 flex-col gap-1.5 rounded-md px-1 py-1 text-left',
              'transition-colors duration-100 disabled:cursor-not-allowed',
              !desactive && 'hover:bg-muted'
            )}
          >
            <span
              className={cn(
                'h-1 w-full rounded-full transition-colors duration-200',
                franchie ? 'bg-primary/40' : active ? 'bg-primary' : 'bg-border'
              )}
            />
            <span
              className={cn(
                'flex items-center gap-1 truncate text-[11px] font-medium',
                active ? 'text-foreground' : franchie ? 'text-muted-foreground' : 'text-muted-foreground/60'
              )}
            >
              {franchie && <Check className="h-3 w-3 shrink-0 text-primary/70" />}
              {etape.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
