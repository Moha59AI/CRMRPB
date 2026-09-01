import { CircleCheck, CircleAlert, CircleX, CircleDashed, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Constat, NiveauSante } from '../diagnostic';

const APPARENCE: Record<
  NiveauSante,
  { icone: typeof CircleCheck; couleur: string; fond: string; bordure: string }
> = {
  ok: {
    icone: CircleCheck,
    couleur: 'text-done',
    fond: 'bg-done-soft',
    bordure: 'border-border',
  },
  attention: {
    icone: CircleAlert,
    couleur: 'text-due',
    fond: 'bg-due-soft',
    bordure: 'border-due/30',
  },
  probleme: {
    icone: CircleX,
    couleur: 'text-destructive',
    fond: 'bg-destructive/10',
    bordure: 'border-destructive/30',
  },
  inactif: {
    icone: CircleDashed,
    couleur: 'text-muted-foreground',
    fond: 'bg-muted',
    bordure: 'border-border',
  },
};

interface CarteEtatProps {
  /** Ce que la carte surveille : « Réception Meta », « Traitement automatique ». */
  sujet: string;
  constat: Constat;
  /** Où mène l'action proposée. */
  lien?: string;
  /** Chiffres secondaires, affichés en pied de carte. */
  chiffres?: { label: string; valeur: number | string }[];
}

export function CarteEtat({ sujet, constat, lien, chiffres }: CarteEtatProps) {
  const style = APPARENCE[constat.niveau];
  const Icone = style.icone;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-card p-4',
        style.bordure,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            style.fond,
          )}
        >
          <Icone className={cn('h-4 w-4', style.couleur)} strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {sujet}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{constat.titre}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {constat.detail}
          </p>
        </div>
      </div>

      {chiffres && chiffres.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          {chiffres.map((c) => (
            <div key={c.label}>
              <p className="text-sm font-semibold tabular-nums text-foreground">{c.valeur}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {constat.action && lien && (
        <Link
          to={lien}
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium',
            'text-primary hover:underline',
          )}
        >
          {constat.action}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}

      {constat.action && !lien && (
        <p className="mt-3 text-xs font-medium text-muted-foreground">{constat.action}</p>
      )}
    </div>
  );
}
