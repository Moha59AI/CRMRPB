import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEffect, useMemo, useState } from 'react';
import { LogOut, Menu, Search, Activity } from 'lucide-react';
import { navSections, settingsNavSections, type NavSection } from '@/config/navigation';
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
import { BandeauZoneTest } from '@/features/zone-test/bandeau-zone-test';
import { cn } from '@/lib/utils';
import { useLeadColorTheme } from '@/features/leads/use-lead-color-theme';
import { CRMCommandPalette } from '@/components/CRMCommandPalette';
import { DesktopTopHeader } from '@/components/DesktopTopHeader';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const estMobile = useEstMobile();
  const estTechnicien = profile?.role === 'technician';
  useTitrePage();
  useLeadColorTheme();

  // Les entrees inaccessibles disparaissent au lieu d'etre affichees puis
  // refusees : proposer une porte fermee est une mauvaise facon de securiser.
  const sectionsVisibles = useMemo(
    () => navSections
      .map((s) => ({ ...s, items: s.items.filter(
        (i) => cheminAutorise(i.path, profile?.role ?? null, profile?.dans_zone_test),
      ) }))
      .filter((s) => s.items.length > 0),
    // L'espace de travail compte autant que le role : basculer dans la zone
    // de test doit faire apparaitre ses modules, et en sortir les retirer.
    [profile?.role, profile?.dans_zone_test]
  );
  const sectionsRecherche = useMemo(() => {
    const cheminsDejaPresents = new Set<string>();
    const toutesLesSections = [
      ...sectionsVisibles,
      ...settingsNavSections.map((section) => ({
        ...section,
        items: section.items.filter((item) => cheminAutorise(
          item.path,
          profile?.role ?? null,
          profile?.dans_zone_test,
        )),
      })),
    ];

    return toutesLesSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (cheminsDejaPresents.has(item.path)) return false;
          cheminsDejaPresents.add(item.path);
          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [profile?.dans_zone_test, profile?.role, sectionsVisibles]);

  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const [commandeOuverte, setCommandeOuverte] = useState(false);

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
    if (path === '/settings' || path === '/finance') return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const titreCourant = sectionsVisibles
    .flatMap((s) => s.items)
    .find((i) => isActive(i.path))?.label ?? APP_NAME;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#eef1ef] dark:bg-background">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Avant l'en-tete et avant tout contenu : on doit savoir ou l'on
            travaille sans avoir a le chercher. */}
        <BandeauZoneTest />
        {!estMobile && (
          <DesktopTopHeader
            sections={sectionsVisibles}
            isActive={isActive}
            onNavigate={navigate}
            onOpenSearch={() => setCommandeOuverte(true)}
            onSignOut={handleSignOut}
            initials={initials}
            name={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
            role={profile?.role}
            notificationsEnabled={!estTechnicien}
          />
        )}
        {/* En-tete telephone : le menu complet vit dans un tiroir plutot que
            dans une barre du bas. Onze entrees reparties en cinq sections n'y
            tiendraient pas, et les tronquer ferait perdre le classement. */}
        <header className="safe-haut shrink-0 border-b border-white/10 bg-[#0b1117]/95 text-white shadow-md backdrop-blur-xl md:hidden">
          <div className="flex h-14 min-w-0 items-center gap-1.5 overflow-hidden px-2.5 min-[390px]:gap-2 min-[390px]:px-3">
          <Sheet open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
            <SheetTrigger asChild>
              <Button
                variant="ghost" size="sm"
                className="h-11 w-11 shrink-0 rounded-xl p-0 text-white/75 hover:bg-white/10 hover:text-white"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-[min(20rem,calc(100vw-0.75rem))] p-0 sm:p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <TiroirNavigation
                sections={sectionsVisibles}
                estActif={isActive}
                onNaviguer={navigate}
                initials={initials}
                nom={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
                role={profile?.role ?? null}
                onDeconnexion={handleSignOut}
                onOuvrirRecherche={() => {
                  setTiroirOuvert(false);
                  setCommandeOuverte(true);
                }}
              />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-[9px] font-black tracking-[-0.08em] text-white shadow-sm min-[360px]:flex">
              RPB
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{titreCourant}</span>
              <span className="hidden items-center gap-1 text-[9px] uppercase tracking-wider text-white/40 min-[360px]:flex">
                <Activity className="h-2.5 w-2.5 text-primary" /> En direct
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCommandeOuverte(true)}
            className="h-11 w-11 shrink-0 rounded-xl p-0 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Rechercher dans le CRM"
          >
            <Search className="h-5 w-5" />
          </Button>

          <div className="crm-mobile-notifications h-11 w-11 shrink-0">
            {!estTechnicien && (
              <>{estMobile && <ClocheNotifications reduit mobile />}</>
            )}
          </div>

          <Avatar className="hidden h-8 w-8 shrink-0 ring-1 ring-white/15 min-[390px]:flex">
            <AvatarFallback className="bg-white/10 text-xs font-semibold text-white">
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
            data-crm-module-shell
          >
            <Outlet />
          </div>
        </ErrorBoundary>

        {!estTechnicien && <CopilotRadar />}

        <BarreOnglets
          role={profile?.role ?? null}
          dansZoneTest={profile?.dans_zone_test}
          onOuvrirMenu={() => setTiroirOuvert(true)}
        />
      </main>

      <CRMCommandPalette
        open={commandeOuverte}
        onOpenChange={setCommandeOuverte}
        sections={sectionsRecherche}
      />
    </div>
  );
}

/** Contenu du tiroir : la meme navigation, deployee et tactile. */
function TiroirNavigation({
  sections, estActif, onNaviguer, initials, nom, role, onDeconnexion, onOuvrirRecherche,
}: {
  sections: NavSection[];
  estActif: (path: string) => boolean;
  onNaviguer: (path: string) => void;
  initials: string;
  nom: string;
  role: string | null;
  onDeconnexion: () => void;
  onOuvrirRecherche: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="safe-haut bg-[#0b1117] px-4 pb-4 pt-4 text-white">
        <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-[10px] font-black tracking-[-0.08em] text-white shadow-lg">
          RPB
        </div>
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{APP_NAME}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-white/40">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Centre de pilotage
          </span>
        </div>
        </div>

        <button
          type="button"
          onClick={onOuvrirRecherche}
          className="mt-4 flex h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white/70"
        >
          <Search className="h-4.5 w-4.5" />
          <span className="flex-1 text-left">Rechercher dans le CRM</span>
        </button>
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
                        ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/10'
                        : 'text-muted-foreground hover:bg-surface hover:text-foreground',
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
