import { useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { cheminsPouce, navItems, type NavItem } from '@/config/navigation';
import { cheminAutorise } from '@/config/permissions';
import type { UserRole } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Barre d'onglets du bas, sur téléphone.
 *
 * Le tiroir garde les seize entrées classées ; il demande trois gestes pour
 * chacune — ouvrir, chercher, appuyer. Or la journée se passe sur quatre
 * écrans, et le CRM se consulte souvent d'une main, l'autre tenant le
 * téléphone à l'oreille. Ces quatre-là descendent donc à portée du pouce, en
 * bas, où la main se trouve déjà ; le reste continue de vivre dans le tiroir,
 * atteint par le cinquième bouton.
 *
 * Elle occupe sa place dans la colonne plutôt que de flotter par-dessus :
 * une barre en `fixed` recouvre la dernière ligne de chaque liste, et il
 * faudrait compenser par une marge basse dans chacune des pages.
 */
export function BarreOnglets({
  role, onOuvrirMenu, dansZoneTest,
}: {
  role: UserRole | null;
  /** Les modules en cours d'essai n'apparaissent que dans l'espace fictif. */
  dansZoneTest?: boolean;
  onOuvrirMenu: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  // Même filtrage que la barre latérale : une entrée qu'on n'a pas le droit
  // d'ouvrir ne s'affiche pas, plutôt que de mener à un refus.
  const onglets = cheminsPouce
    .map((chemin) => navItems.find((i) => i.path === chemin))
    .filter((i): i is NavItem => Boolean(i) && cheminAutorise(i!.path, role, dansZoneTest));

  if (onglets.length === 0) return null;

  const estActif = (chemin: string) => location.pathname.startsWith(chemin);
  const dansLeTiroir = !onglets.some((i) => estActif(i.path));

  return (
    <div className="safe-bas shrink-0 bg-background/95 px-2 pb-2 pt-1 backdrop-blur-xl md:hidden">
      <nav
        aria-label="Navigation principale"
        className="flex items-stretch rounded-2xl border border-border/80 bg-card/95 p-1 shadow-[var(--shadow-3)]"
      >
      {onglets.map((item) => {
        const actif = estActif(item.path);
        const Icone = item.icon;
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5 transition-colors',
              actif && 'bg-accent/70',
            )}
          >
            {/* La pastille tient lieu d'état actif : sur cinq icônes de la
                même couleur, une simple nuance ne se repère pas d'un coup. */}
            <span
              className={cn(
                'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                actif ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground',
              )}
            >
              <Icone className="h-5 w-5" strokeWidth={actif ? 2.25 : 1.75} />
            </span>
            <span
              className={cn(
                'max-w-full truncate text-[10px] font-medium leading-none',
                actif ? 'font-semibold text-primary' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onOuvrirMenu}
        aria-label="Ouvrir le menu"
        className={cn(
          'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5 transition-colors',
          dansLeTiroir && 'bg-accent/70',
        )}
      >
        {/* Sur un écran qui n'est dans aucun onglet, c'est « Menu » qui porte
            l'état actif — sans quoi la barre prétendrait qu'on n'est nulle
            part. */}
        <span
          className={cn(
            'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
            dansLeTiroir ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground',
          )}
        >
          <Menu className="h-5 w-5" strokeWidth={dansLeTiroir ? 2.25 : 1.75} />
        </span>
        <span
          className={cn(
            'text-[10px] font-medium leading-none',
            dansLeTiroir ? 'font-semibold text-primary' : 'text-muted-foreground',
          )}
        >
          Menu
        </span>
      </button>
      </nav>
    </div>
  );
}
