import { Phone, MessageSquare, Clock, Check, FileText, CalendarClock, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Relance, RelanceKind, UrgencyLevel } from '@/services/relances-service';

const ICONE: Record<RelanceKind, typeof Phone> = {
  rappel: Phone,
  documents: FileText,
  rdv: CalendarClock,
  tache: ListTodo,
};

const POINT: Record<UrgencyLevel, string> = {
  urgent: 'bg-urgent',
  due: 'bg-due',
  upcoming: 'bg-upcoming',
};

const PASTILLE: Record<UrgencyLevel, string> = {
  urgent: 'bg-urgent-soft text-urgent',
  due: 'bg-due-soft text-due',
  upcoming: 'bg-upcoming-soft text-upcoming',
};

function delai(relance: Relance): string {
  if (relance.urgency === 'urgent') {
    return relance.daysLate === 1 ? '1 jour de retard' : `${relance.daysLate} jours de retard`;
  }
  if (relance.urgency === 'due') return "Aujourd'hui";

  const jours = Math.round(
    (new Date(relance.dueAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  return jours === 1 ? 'Demain' : `Dans ${jours} jours`;
}

interface RelanceRowProps {
  relance: Relance;
  onAppeler: (relance: Relance) => void;
  onSms: (relance: Relance) => void;
  onReporter: (relance: Relance) => void;
  onTraiter: (relance: Relance) => void;
  onOuvrir: (relance: Relance) => void;
  enCours: boolean;
}

export function RelanceRow({
  relance, onAppeler, onSms, onReporter, onTraiter, onOuvrir, enCours,
}: RelanceRowProps) {
  const Icone = ICONE[relance.kind];

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3',
        'transition-colors duration-150 hover:border-foreground/15 hover:bg-muted/40',
        enCours && 'animate-check-out pointer-events-none'
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', POINT[relance.urgency])} aria-hidden />

      <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />

      <button
        type="button"
        onClick={() => onOuvrir(relance)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-medium text-foreground">{relance.title}</p>
        <p className="truncate text-xs text-muted-foreground">{relance.reason}</p>
      </button>

      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular',
          PASTILLE[relance.urgency]
        )}
      >
        {delai(relance)}
      </span>

      {/* Les actions n'apparaissent qu'au survol pour garder la liste calme,
          mais restent atteignables au clavier. */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
        {relance.phone && (
          <>
            <Button
              variant="ghost" size="icon" className="h-8 w-8 rounded-full"
              onClick={() => onAppeler(relance)} title="Appeler"
            >
              <Phone className="h-4 w-4" />
              <span className="sr-only">Appeler {relance.title}</span>
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8 rounded-full"
              onClick={() => onSms(relance)} title="Envoyer un SMS"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="sr-only">Envoyer un SMS à {relance.title}</span>
            </Button>
          </>
        )}
        <Button
          variant="ghost" size="icon" className="h-8 w-8 rounded-full"
          onClick={() => onReporter(relance)} title="Reporter à demain"
        >
          <Clock className="h-4 w-4" />
          <span className="sr-only">Reporter à demain</span>
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 rounded-full text-done hover:bg-done-soft hover:text-done"
          onClick={() => onTraiter(relance)} title="Marquer comme traité"
        >
          <Check className="h-4 w-4" />
          <span className="sr-only">Marquer comme traité</span>
        </Button>
      </div>
    </div>
  );
}
