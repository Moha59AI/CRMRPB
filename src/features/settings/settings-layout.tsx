import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { settingsNavItems } from '@/config/navigation';
import { cheminAutorise } from '@/config/permissions';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Sous-navigation des réglages.
 *
 * `settingsNavItems` existait depuis le début mais n'était affiché nulle
 * part : les pages Intégrations, Webhooks, Utilisateurs, Assureurs et
 * Cadences n'étaient joignables qu'en tapant leur URL. Une route sans lien
 * est une page qui n'existe pas.
 *
 * Les entrées sont filtrées par rôle. Proposer un onglet qui mène à une
 * redirection est pire que ne pas le proposer : l'utilisateur croit à une
 * panne.
 */
export function SettingsLayout() {
  const { profile } = useAuth();

  const onglets = settingsNavItems.filter((item) =>
    cheminAutorise(item.path, profile?.role ?? null),
  );

  return (
    <div className="flex min-h-full flex-col">
      <nav
        aria-label="Réglages"
        className="flex gap-1 overflow-x-auto border-b border-border px-6 py-2"
      >
        {onglets.map((item) => {
          const Icone = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              // `end` sur /settings seulement : sans cela, l'onglet Général
              // resterait actif sur toutes les sous-pages.
              end={item.path === '/settings'}
              title={item.description}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5',
                  'text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icone className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
