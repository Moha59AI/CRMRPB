import { useCallback, useEffect, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Coque commune à toutes les fiches — dossier, client, et celles à venir.
 *
 * Extraite pour que les fiches soient identiques par construction plutôt que
 * par recopie : deux surfaces de travail qui se ressemblent à peu près sont
 * plus déroutantes qu'une seule bien faite.
 *
 * Elle porte le comportement (superposition, fond assombri, Échap, X,
 * défilement, onglets, navigation entre éléments) et laisse chaque fiche
 * fournir son en-tête et son contenu.
 */

export interface OngletFiche<T extends string> {
  cle: T;
  label: string;
}

export interface NavigationFiche {
  position: number;
  total: number;
  precedent: (() => void) | null;
  suivant: (() => void) | null;
}

interface FicheOverlayProps<T extends string> {
  /** Contenu de l'en-tête : identité, informations, pipeline, actions. */
  entete: ReactNode;
  onglets: readonly OngletFiche<T>[];
  ongletActif: T;
  onChangerOnglet: (onglet: T) => void;
  onFermer: () => void;
  navigation?: NavigationFiche;
  piedDePage?: ReactNode;
  /** Barre d'actions affichée uniquement sur mobile. */
  actionsMobile?: ReactNode;
  /** Ouverte par son URL : plein écran, sans rien derrière à préserver. */
  pleinePage?: boolean;
  children: ReactNode;
}

export function FicheOverlay<T extends string>({
  entete, onglets, ongletActif, onChangerOnglet, onFermer,
  navigation, piedDePage, actionsMobile, pleinePage, children,
}: FicheOverlayProps<T>) {
  const fermer = useCallback(() => onFermer(), [onFermer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;

      // Un dialogue ouvert dans la fiche est proprietaire d'Echap. Sans ce
      // garde, Radix fermait le dialogue tandis que la coque demandait aussi
      // la fermeture de la fiche dans le meme evenement : deux demontages
      // concurrents pouvaient laisser un voile invisible au-dessus du CRM.
      const dialogueImbrique = document.querySelector(
        '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]',
      );
      if (dialogueImbrique) return;

      fermer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fermer]);

  const surface = (
    <div
      className={cn(
        'flex flex-col overflow-hidden bg-background',
        pleinePage
          ? 'h-full w-full'
          : 'h-full w-full sm:h-[94vh] sm:max-h-[1000px] sm:w-[94vw] sm:max-w-[1600px] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl'
      )}
    >
      <header className="shrink-0 border-b border-border px-4 pt-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {navigation && navigation.total > 1 && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                  disabled={!navigation.precedent}
                  onClick={() => navigation.precedent?.()}
                  title="Précédent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="whitespace-nowrap text-xs text-muted-foreground tabular">
                  {navigation.position} / {navigation.total}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                  disabled={!navigation.suivant}
                  onClick={() => navigation.suivant?.()}
                  title="Suivant"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="min-w-0 flex-1">{entete}</div>
          </div>

          <Button
            variant="ghost" size="icon"
            className="h-9 w-9 shrink-0 rounded-full hover:bg-muted"
            onClick={fermer} title="Fermer (Échap)"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Fermer</span>
          </Button>
        </div>

        <nav className="mt-3 flex gap-1 overflow-x-auto">
          {onglets.map(({ cle, label }) => (
            <button
              key={cle} type="button" onClick={() => onChangerOnglet(cle)}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-100',
                ongletActif === cle
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">{children}</div>

      {piedDePage && (
        <footer className="shrink-0 border-t border-border bg-muted/40 px-4 py-2.5 sm:px-6">
          {piedDePage}
        </footer>
      )}

      {actionsMobile && (
        <footer className="flex shrink-0 items-center justify-around border-t border-border px-2 py-2 sm:hidden">
          {actionsMobile}
        </footer>
      )}
    </div>
  );

  if (pleinePage) return surface;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in">
      {/* Le fond assombri ferme au clic, comme toute surface superposee. */}
      <button
        type="button" onClick={fermer} aria-label="Fermer la fiche"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div className="relative z-10 h-full w-full sm:h-auto sm:w-auto">{surface}</div>
    </div>
  );
}

/** Bouton de la barre d'actions mobile, commun aux fiches. */
export function ActionMobile({
  icone: Icone, label, onClick, desactive,
}: {
  icone: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  desactive?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={desactive}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs text-muted-foreground disabled:opacity-40"
    >
      <Icone className="h-5 w-5" />
      {label}
    </button>
  );
}
