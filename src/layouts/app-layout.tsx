import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEffect, useMemo, useState } from 'react';
import { LogOut, ChevronLeft, ChevronRight, Car, Menu } from 'lucide-react';
import { navSections, type NavSection } from '@/config/navigation';
import { cheminAutorise } from '@/config/permissions';
import { SelecteurTheme } from '@/components/SelecteurTheme';
import { ClocheNotifications } from '@/components/ClocheNotifications';
import { CopilotRadar } from '@/features/ai/copilot-radar';
import { BarreOnglets } from '@/components/BarreOnglets';
import { useTitrePage } from '@/hooks/use-titre-page';
import { useEstMobile } from '@/hooks/use-media-query';
import { APP_NAME } from '@/config/constants';
import { useAuth } from '@/features/auth/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { BandeauZoneTest, BoutonZoneTest } from '@/features/zone-test/bandeau-zone-test';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const estMobile = useEstMobile();
  useTitrePage();

  // Les entrees inaccessibles disparaissent au lieu d'etre affichees puis
  // refusees : proposer une porte fermee est une mauvaise facon de securiser.
  const sectionsVisibles = useMemo(
    () => navSections
      .map((s) => ({ ...s, items: s.items.filter((i) => cheminAutorise(i.path, profile?.role ?? null)) }))
      .filter((s) => s.items.length > 0),
    [profile?.role]
  );
  const [expanded, setExpanded] = useState(false);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);

  // Le tiroir se ferme au changement de page : sur telephone il recouvre
  // l'ecran, le laisser ouvert cacherait la page qu'on vient d'atteindre.
  useEffect(() => setTiroirOuvert(false), [location.pathname]);

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

  const titreCourant = sectionsVisibles
    .flatMap((s) => s.items)
    .find((i) => isActive(i.path))?.label ?? APP_NAME;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Barre laterale : masquee sur telephone, ou elle mangerait un sixieme
          de la largeur pour des icones qu'on ne vise pas au pouce. */}
      <aside
        className={cn(
          'hidden flex-col border-r border-border bg-card transition-all duration-200 md:flex',
          expanded ? 'w-56' : 'w-16'
        )}
      >
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Car className="h-4 w-4 text-primary-foreground" />
          </div>
          {expanded && (
            <span className="animate-fade-in truncate text-sm font-semibold text-foreground">
              {APP_NAME}
            </span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto scrollbar-thin p-2">
          <TooltipProvider delayDuration={200}>
            {sectionsVisibles.map((section, i) => (
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
                              'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                              !expanded && 'justify-center',
                              active
                                ? 'bg-secondary text-secondary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                            {expanded && <span className="animate-fade-in truncate">{item.label}</span>}
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

        <div className="border-t border-border p-2">
          <div className="mb-1">
            {!estMobile && <ClocheNotifications reduit={!expanded} />}
          </div>
          {/* N'apparait que pour les comptes de `acces_zone_test`. Le
              masquage ne protege rien : les fonctions SQL verifient
              l'autorisation chacune de leur cote. */}
          <div className="mb-1">
            <BoutonZoneTest reduit={!expanded} />
          </div>
          <div className="mb-1">
            <SelecteurTheme reduit={!expanded} />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mb-1 flex w-full items-center justify-center rounded-lg py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className="flex items-center gap-2 rounded-lg p-2">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            {expanded && (
              <div className="flex flex-1 animate-fade-in items-center justify-between">
                <div className="truncate">
                  <p className="truncate text-xs font-medium text-foreground">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="truncate text-[10px] capitalize text-muted-foreground">
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

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Avant l'en-tete et avant tout contenu : on doit savoir ou l'on
            travaille sans avoir a le chercher. */}
        <BandeauZoneTest />
        {/* En-tete telephone : le menu complet vit dans un tiroir plutot que
            dans une barre du bas. Onze entrees reparties en cinq sections n'y
            tiendraient pas, et les tronquer ferait perdre le classement. */}
        <header className="safe-haut shrink-0 border-b border-border bg-card md:hidden">
          <div className="flex h-14 items-center gap-3 px-3">
          <Sheet open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
            <SheetTrigger asChild>
              <Button
                variant="ghost" size="sm"
                className="h-11 w-11 shrink-0 rounded-lg p-0"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-72 p-0 sm:p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <TiroirNavigation
                sections={sectionsVisibles}
                estActif={isActive}
                onNaviguer={navigate}
                initials={initials}
                nom={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
                role={profile?.role ?? null}
                onDeconnexion={handleSignOut}
              />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Car className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="truncate text-sm font-semibold text-foreground">
              {titreCourant}
            </span>
          </div>

          <div className="w-11 shrink-0">
            {estMobile && <ClocheNotifications reduit mobile />}
          </div>

          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          </div>
        </header>

        {/* Une limite par module : un ecran qui plante ne doit pas emporter la
            navigation ni le reste du CRM. La cle de reinitialisation est le
            chemin courant, pour repartir d'un etat sain en changeant de page. */}
        <ErrorBoundary
          resetKey={location.pathname}
          titre="Cet écran n'a pas pu s'afficher"
          message="Le reste du CRM reste utilisable. Réessayez, ou passez à un autre écran."
        >
          {/* Une seule transition commune garde le meme rythme dans tous les
              modules, y compris ceux ajoutes plus tard. La cle rejoue le
              mouvement uniquement lors d'un vrai changement de page. */}
          <div
            key={location.pathname}
            className="app-route-transition flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <Outlet />
          </div>
        </ErrorBoundary>

        <CopilotRadar />

        <BarreOnglets
          role={profile?.role ?? null}
          onOuvrirMenu={() => setTiroirOuvert(true)}
        />
      </main>
    </div>
  );
}

/** Contenu du tiroir : la meme navigation, deployee et tactile. */
function TiroirNavigation({
  sections, estActif, onNaviguer, initials, nom, role, onDeconnexion,
}: {
  sections: NavSection[];
  estActif: (path: string) => boolean;
  onNaviguer: (path: string) => void;
  initials: string;
  nom: string;
  role: string | null;
  onDeconnexion: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="safe-haut flex items-center gap-3 border-b border-border px-4 pb-3 pt-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Car className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="truncate text-sm font-semibold text-foreground">{APP_NAME}</span>
      </div>

      <nav className="defilement-contenu flex-1 overflow-y-auto p-2">
        {sections.map((section, i) => (
          <div key={section.titre} className={cn(i > 0 && 'mt-4')}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {section.titre}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => onNaviguer(item.path)}
                    className={cn(
                      // py-2.5 : une cible de 44 px, taille minimale d'un appui
                      // au pouce.
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium',
                      estActif(item.path)
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="safe-bas border-t border-border p-2">
        <SelecteurTheme reduit={false} />
        <div className="mt-1 flex items-center gap-2 rounded-lg p-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{nom || 'Sans nom'}</p>
            <p className="truncate text-[10px] capitalize text-muted-foreground">{role}</p>
          </div>
          <button
            onClick={onDeconnexion}
            aria-label="Se déconnecter"
            className="rounded-md p-2 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
