import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { settingsNavSections } from '@/config/navigation';
import { cheminAutorise } from '@/config/permissions';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Navigation des réglages, groupée par nature.
 *
 * Sept entrées à plat ne se lisent pas : on cherchait « Assureurs » entre
 * « Webhooks » et « Meta Ads », qui n'ont rien à voir. Les sections séparent
 * ce qui décrit l'atelier, ce qui règle le métier, et ce qui branche
 * l'extérieur.
 *
 * Une colonne plutôt qu'une barre d'onglets : des intitulés de section n'ont
 * pas de place sur une seule ligne, et c'est justement eux qui rendent la
 * liste lisible.
 *
 * Les entrées sont filtrées par rôle. Proposer un lien qui mène à une
 * redirection est pire que ne pas le proposer : l'utilisateur croit à une
 * panne.
 */
export function SettingsLayout() {
  const { profile } = useAuth();

  const sections = settingsNavSections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => cheminAutorise(i.path, profile?.role ?? null)),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <nav
        aria-label="Réglages"
        className={cn(
          'shrink-0 border-b border-border md:w-56 md:border-b-0 md:border-r',
          'px-3 py-3 md:py-4',
        )}
      >
        {sections.map((section) => (
          <div key={section.titre} className="mb-4 last:mb-0">
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.titre}
            </p>

            {/* Defilement horizontal sur petit ecran : une colonne de sept
                liens y prendrait tout l'espace avant le contenu. */}
            <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {section.items.map((item) => {
                const Icone = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    // `end` sur /settings seulement : sinon l'entree Général
                    // resterait active sur toutes les sous-pages.
                    end={item.path === '/settings'}
                    title={item.description}
                    className={({ isActive }) =>
                      cn(
                        'flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5',
                        'text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )
                    }
                  >
                    <Icone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
