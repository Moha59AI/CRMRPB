import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHOIX = [
  { valeur: 'light', icone: Sun, libelle: 'Clair' },
  { valeur: 'dark', icone: Moon, libelle: 'Sombre' },
  { valeur: 'system', icone: Monitor, libelle: 'Systeme' },
] as const;

/**
 * Selecteur clair / sombre / systeme.
 *
 * Le rendu attend le montage : next-themes ne connait le theme resolu qu'au
 * premier effet, et afficher un etat avant cela produit une bascule visible.
 */
export function SelecteurTheme({ reduit }: { reduit?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [monte, setMonte] = useState(false);

  useEffect(() => setMonte(true), []);
  if (!monte) return <div className="h-8" aria-hidden />;

  if (reduit) {
    const suivant = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    const Icone = CHOIX.find((c) => c.valeur === (theme ?? 'system'))?.icone ?? Monitor;
    return (
      <button
        type="button"
        onClick={() => setTheme(suivant)}
        title={`Theme : ${CHOIX.find((c) => c.valeur === (theme ?? 'system'))?.libelle}`}
        className="flex w-full items-center justify-center rounded-lg py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Icone className="h-4 w-4" />
        <span className="sr-only">Changer de theme</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {CHOIX.map(({ valeur, icone: Icone, libelle }) => (
        <button
          key={valeur}
          type="button"
          onClick={() => setTheme(valeur)}
          aria-pressed={(theme ?? 'system') === valeur}
          title={libelle}
          className={cn(
            'flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors',
            (theme ?? 'system') === valeur
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icone className="h-3.5 w-3.5" />
          <span className="sr-only">{libelle}</span>
        </button>
      ))}
    </div>
  );
}
