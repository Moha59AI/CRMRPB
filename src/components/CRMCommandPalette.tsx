import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BellRing, LayoutDashboard, UserRoundPlus } from 'lucide-react';
import type { NavSection } from '@/config/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

interface CRMCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: NavSection[];
}

/**
 * Recherche globale du CRM.
 *
 * Le clavier sert au bureau, le bouton sert sur tablette et mobile. Les
 * résultats reprennent uniquement les modules déjà filtrés par les droits de
 * l'utilisateur : cette palette ne crée donc aucun nouveau chemin d'accès.
 */
export function CRMCommandPalette({
  open,
  onOpenChange,
  sections,
}: CRMCommandPaletteProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const ouvrirAuClavier = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };

    window.addEventListener('keydown', ouvrirAuClavier);
    return () => window.removeEventListener('keydown', ouvrirAuClavier);
  }, [onOpenChange, open]);

  const cheminsDisponibles = useMemo(
    () => new Set(sections.flatMap((section) => section.items.map((item) => item.path))),
    [sections],
  );

  const ouvrir = (path: string, state?: Record<string, unknown>) => {
    onOpenChange(false);
    navigate(path, state ? { state } : undefined);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Rechercher un module ou une action…" />
      <CommandList className="max-h-[min(30rem,70dvh)] p-2">
        <CommandEmpty>Aucun module ne correspond à cette recherche.</CommandEmpty>

        <CommandGroup heading="Actions rapides">
          {cheminsDisponibles.has('/leads') && (
            <CommandItem
              value="Créer un nouveau lead nouvelle demande client"
              onSelect={() => ouvrir('/leads', { ouvrirNouveauLead: true })}
              className="gap-3 rounded-xl px-3 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRoundPlus className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Créer un nouveau lead</span>
                <span className="block truncate text-xs text-muted-foreground">Enregistrer une nouvelle demande client</span>
              </span>
              <CommandShortcut>Créer</CommandShortcut>
            </CommandItem>
          )}

          {cheminsDisponibles.has('/today') && (
            <CommandItem
              value="Voir les priorités du jour aujourd'hui"
              onSelect={() => ouvrir('/today')}
              className="gap-3 rounded-xl px-3 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <LayoutDashboard className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Voir les priorités du jour</span>
                <span className="block truncate text-xs text-muted-foreground">Revenir au centre de pilotage</span>
              </span>
            </CommandItem>
          )}

          {cheminsDisponibles.has('/relances') && (
            <CommandItem
              value="Ouvrir les relances rappels urgences"
              onSelect={() => ouvrir('/relances')}
              className="gap-3 rounded-xl px-3 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <BellRing className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Ouvrir les relances</span>
                <span className="block truncate text-xs text-muted-foreground">Traiter les prochaines actions</span>
              </span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator className="my-2" />

        {sections.map((section) => (
          <CommandGroup key={section.titre} heading={section.titre}>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.path}
                  value={`${item.label} ${item.description}`}
                  onSelect={() => ouvrir(item.path)}
                  className="group gap-3 rounded-xl px-3 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors group-data-[selected=true]:border-primary/30 group-data-[selected=true]:text-primary">
                    <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-data-[selected=true]:translate-x-0.5 group-data-[selected=true]:text-primary" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
