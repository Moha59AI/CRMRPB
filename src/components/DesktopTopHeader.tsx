import { useMemo, useState } from 'react';
import { Activity, ChevronRight, LogOut, Menu, Search } from 'lucide-react';
import type { NavSection } from '@/config/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ClocheNotifications } from '@/components/ClocheNotifications';
import { SelecteurTheme } from '@/components/SelecteurTheme';
import { cn } from '@/lib/utils';
import { roleLabels } from '@/config/roles';
import type { UserRole } from '@/types';

const CHEMINS_PRINCIPAUX = ['/today', '/leads', '/calendar', '/tasks', '/emails'];
const CHEMINS_PRINCIPAUX_CONSEILLER = ['/today', '/relances', '/leads', '/tasks', '/calendar'];

interface DesktopTopHeaderProps {
  sections: NavSection[];
  isActive: (path: string) => boolean;
  onNavigate: (path: string) => void;
  onOpenSearch: () => void;
  onSignOut: () => void;
  initials: string;
  name: string;
  role?: UserRole | null;
  notificationsEnabled?: boolean;
}

/**
 * Navigation bureau inspiree de la maquette Bolt : une barre courte et
 * horizontale laisse toute la largeur aux listes de travail. Les cinq ecrans
 * quotidiens restent a un clic ; les autres modules sont groupes dans le
 * tiroir, sans perdre la structure ni les permissions du CRM.
 */
export function DesktopTopHeader({
  sections,
  isActive,
  onNavigate,
  onOpenSearch,
  onSignOut,
  initials,
  name,
  role,
  notificationsEnabled = true,
}: DesktopTopHeaderProps) {
  const [modulesOpen, setModulesOpen] = useState(false);
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const cheminsPrincipaux = role === 'advisor' ? CHEMINS_PRINCIPAUX_CONSEILLER : CHEMINS_PRINCIPAUX;
  const mainItems = cheminsPrincipaux
    .map((path) => items.find((item) => item.path === path))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const moduleActif = items.some((item) => isActive(item.path))
    && !mainItems.some((item) => isActive(item.path));

  const naviguer = (path: string) => {
    setModulesOpen(false);
    onNavigate(path);
  };

  return (
    <>
      <header className="crm-top-header hidden h-16 shrink-0 items-center border-b border-border/90 bg-card/90 px-4 backdrop-blur-xl md:flex lg:px-6">
        <button
          type="button"
          onClick={() => onNavigate('/today')}
          className="flex min-w-[11.5rem] items-center gap-2.5 text-left"
          aria-label="Ouvrir l'accueil"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18372b] text-[10px] font-black tracking-[-0.07em] text-[#eaffdf] shadow-sm">
            RPB
          </span>
          <span className="min-w-0">
            <strong className="block truncate font-display text-sm font-bold tracking-[-0.04em] text-foreground">
              Relais Pare-Brise
            </strong>
            <span className="block text-[8px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              CRM opérationnel
            </span>
          </span>
        </button>

        <nav className="flex h-full min-w-0 flex-1 items-stretch" aria-label="Navigation principale">
          {mainItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => onNavigate(item.path)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'crm-top-tab relative flex min-w-12 items-center justify-center gap-1.5 px-2 text-[11px] font-semibold transition-colors lg:px-3',
                  active ? 'text-[#1b4b31]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                <span className="hidden xl:inline">{item.label}</span>
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-[#8fdd63]" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setModulesOpen(true)}
            className={cn(
              'crm-top-tab relative flex min-w-12 items-center justify-center gap-1.5 px-2 text-[11px] font-semibold transition-colors lg:px-3',
              moduleActif ? 'text-[#1b4b31]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Menu className="h-4 w-4" />
            <span className="hidden xl:inline">Modules</span>
            {moduleActif && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-[#8fdd63]" />}
          </button>
        </nav>

        <div className="ml-3 flex shrink-0 items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1.5 text-[10px] font-semibold text-[#64816f] 2xl:flex">
            <i className="h-1.5 w-1.5 rounded-full bg-[#65b477] shadow-[0_0_0_3px_#dff0e1]" />
            À jour
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenSearch}
            className="h-9 w-9 rounded-lg p-0 text-muted-foreground hover:bg-[#edf4ed] hover:text-foreground"
            aria-label="Rechercher dans le CRM"
          >
            <Search className="h-4 w-4" />
          </Button>
          {notificationsEnabled && (
            <div className="h-9 w-9 overflow-visible">
              <ClocheNotifications reduit mobile />
            </div>
          )}
          <div className="h-9 w-9 overflow-hidden rounded-lg">
            <SelecteurTheme reduit />
          </div>
          <div className="ml-1 flex items-center gap-2 border-l border-border pl-2">
            <Avatar className="h-8 w-8 border-2 border-card shadow-sm">
              <AvatarFallback className="bg-[#d5efc5] text-[10px] font-bold text-[#376044]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden max-w-28 2xl:block">
              <p className="truncate text-[11px] font-semibold text-foreground">{name || 'Utilisateur'}</p>
              <p className="truncate text-[9px] text-muted-foreground">{role ? roleLabels[role] : 'CRM'}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              className="hidden h-8 w-8 rounded-lg p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:inline-flex"
              aria-label="Se déconnecter"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={modulesOpen} onOpenChange={setModulesOpen}>
        <SheetContent side="right" className="w-[min(25rem,calc(100vw-1rem))] p-0 sm:max-w-[25rem]">
          <SheetTitle className="sr-only">Tous les modules</SheetTitle>
          <div className="flex h-full flex-col bg-[#f4f7f4]">
            <div className="border-b border-border bg-card px-5 py-5">
              <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#5d8069]">
                <Activity className="h-3 w-3" /> Centre de pilotage
              </span>
              <h2 className="mt-1.5 font-display text-xl font-bold tracking-[-0.04em] text-foreground">Tous les modules</h2>
              <button
                type="button"
                onClick={() => {
                  setModulesOpen(false);
                  onOpenSearch();
                }}
                className="mt-4 flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs text-muted-foreground shadow-sm transition hover:border-[#b8cdbd] hover:text-foreground"
              >
                <Search className="h-4 w-4" /> Rechercher une fiche ou une action
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
              {sections.map((section, index) => (
                <section key={section.titre} className={cn(index > 0 && 'mt-5')}>
                  <p className="mb-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.17em] text-muted-foreground/70">
                    {section.titre}
                  </p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.path);
                      return (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => naviguer(item.path)}
                          className={cn(
                            'group flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition',
                            active
                              ? 'border-[#b6dca8] bg-[#e6f3e1] text-[#285d3c]'
                              : 'border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground',
                          )}
                        >
                          <span className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            active ? 'bg-[#cceabb] text-[#2b6d40]' : 'bg-card text-muted-foreground shadow-sm group-hover:text-[#376848]',
                          )}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-[11px] font-semibold">{item.label}</strong>
                            <small className="mt-0.5 block truncate text-[9px] font-normal opacity-70">{item.description}</small>
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>

            <div className="border-t border-border bg-card p-3">
              <button
                type="button"
                onClick={onSignOut}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" /> Se déconnecter
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
