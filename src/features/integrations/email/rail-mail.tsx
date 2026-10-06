// Le rail de navigation de la boîte mail
//
// Les vues étaient sept pastilles alignées en haut, au-dessus de la liste :
// elles poussaient la liste vers le bas et, passé quatre ou cinq, elles
// débordaient. Gmail les met dans un rail vertical à gauche — « Boîte de
// réception », « Messages suivis », « Envoyés », puis les catégories — avec
// le compte de non-lus à droite de chaque entrée.
//
// Le rail tient dans la largeur d'une colonne et accepte autant d'entrées
// qu'on veut. C'est ce qui permet d'ajouter une catégorie métier sans
// repenser l'en-tête.

import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EntreeRail<T extends string> {
  cle: T;
  label: string;
  Icone: typeof PenLine;
  /** Messages non lus dans cette vue. Zero n'affiche rien. */
  nonLus?: number;
  /** Total, affiche quand il n'y a pas de non-lu a signaler. */
  total?: number;
}

export interface RailMailProps<T extends string> {
  entrees: readonly EntreeRail<T>[];
  /** Entrees rangees sous « Catégories ». */
  categories?: readonly EntreeRail<T>[];
  active: T;
  onChanger: (cle: T) => void;
  onEcrire: () => void;
}

function Entree<T extends string>({ entree, active, onChanger }: {
  entree: EntreeRail<T>;
  active: boolean;
  onChanger: (cle: T) => void;
}) {
  const { Icone, nonLus = 0, total } = entree;

  return (
    <button
      type="button"
      onClick={() => onChanger(entree.cle)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-full py-2 pl-3 pr-3 text-left text-sm transition-colors',
        active
          ? 'bg-primary/10 font-semibold text-primary'
          : 'text-muted-foreground hover:bg-surface hover:text-foreground',
      )}
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{entree.label}</span>
      {/* Le non-lu prime sur le total : c'est lui qui appelle une action. */}
      {nonLus > 0 ? (
        <span className={cn('shrink-0 text-xs tabular-nums', active ? 'text-primary' : 'font-semibold text-foreground')}>
          {nonLus}
        </span>
      ) : total !== undefined && total > 0 ? (
        <span className="shrink-0 text-xs tabular-nums text-faint">{total}</span>
      ) : null}
    </button>
  );
}

export function RailMail<T extends string>({
  entrees, categories, active, onChanger, onEcrire,
}: RailMailProps<T>) {
  return (
    <nav
      aria-label="Dossiers de la boîte mail"
      className="flex h-full min-h-0 w-full flex-col gap-1 overflow-y-auto p-2 scrollbar-thin sm:w-[220px] sm:shrink-0 sm:border-r sm:border-border"
    >
      <Button
        type="button"
        className="mb-2 h-12 justify-start rounded-2xl px-4 text-sm shadow-sm"
        onClick={onEcrire}
      >
        <PenLine className="mr-3 h-4 w-4" />
        Nouveau message
      </Button>

      {entrees.map((entree) => (
        <Entree key={entree.cle} entree={entree} active={entree.cle === active} onChanger={onChanger} />
      ))}

      {categories && categories.length > 0 && (
        <>
          <p className="mt-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Catégories
          </p>
          {categories.map((entree) => (
            <Entree key={entree.cle} entree={entree} active={entree.cle === active} onChanger={onChanger} />
          ))}
        </>
      )}
    </nav>
  );
}
