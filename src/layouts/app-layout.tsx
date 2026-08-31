import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LogOut, ChevronLeft, ChevronRight, Car } from 'lucide-react';
import { navSections } from '@/config/navigation';
import { APP_NAME } from '@/config/constants';
import { useAuth } from '@/features/auth/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const initials = [
    profile?.first_name?.[0] ?? '',
    profile?.last_name?.[0] ?? '',
  ].join('').toUpperCase() || '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/settings') return location.pathname === '/settings';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-border bg-card transition-all duration-200',
          expanded ? 'w-56' : 'w-16'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Car className="h-4 w-4 text-primary-foreground" />
          </div>
          {expanded && (
            <span className="text-sm font-semibold text-foreground animate-fade-in truncate">
              {APP_NAME}
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto scrollbar-thin p-2">
          <TooltipProvider delayDuration={200}>
            {navSections.map((section, i) => (
              <div key={section.titre} className={cn(i > 0 && 'mt-4')}>
                {/* Le titre de section disparait en mode reduit : il ne reste
                    que les icones, et un intitule tronque n'aiderait personne. */}
                {expanded ? (
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {section.titre}
                  </p>
                ) : (
                  i > 0 && <div className="mx-3 mb-2 border-t border-border" />
                )}

                <div className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const active = isActive(item.path);
                    const Icon = item.icon;
                    return (
                      <Tooltip key={item.path}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => navigate(item.path)}
                            className={cn(
                              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                              expanded ? 'w-full' : 'w-full justify-center',
                              active
                                ? 'bg-secondary text-secondary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                            {expanded && <span className="truncate animate-fade-in">{item.label}</span>}
                          </button>
                        </TooltipTrigger>
                        {!expanded && (
                          <TooltipContent side="right" sideOffset={8}>
                            <p>{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </TooltipProvider>
        </nav>

        {/* Bottom: expand toggle + user + signout */}
        <div className="border-t border-border p-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="mb-1 flex w-full items-center justify-center rounded-lg py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className={cn('flex items-center gap-2 rounded-lg p-2', expanded && 'justify-start')}>
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            {expanded && (
              <div className="flex flex-1 items-center justify-between animate-fade-in">
                <div className="truncate">
                  <p className="truncate text-xs font-medium text-foreground">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground capitalize">
                    {profile?.role}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
