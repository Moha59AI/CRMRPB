// Savoir en permanence dans quel espace on travaille
//
// Le danger d'un espace de test n'est pas de s'y tromper de clic : c'est de
// croire qu'on est ailleurs. Le bandeau reste donc affiché tout le temps, en
// haut, en orange, et il ne se referme pas.
//
// Le bouton d'entrée, lui, n'apparaît que pour les comptes autorisés. Ce
// masquage ne protège rien — les trois fonctions SQL vérifient l'autorisation
// chacune de leur côté — il évite seulement de proposer une porte fermée.

import { FlaskConical, Loader2, LogOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useZoneTest } from './etat-zone';

/** Le bandeau permanent, affiché seulement dans l'espace de test. */
export function BandeauZoneTest() {
  const { dedans, basculer, reinitialiser } = useZoneTest();
  if (!dedans) return null;

  const occupe = basculer.isPending || reinitialiser.isPending;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/40 bg-warning/15 px-3 py-2 sm:px-4"
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
        <FlaskConical className="h-4 w-4 text-warning" aria-hidden />
        Zone de test
      </span>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
        Données fictives. Rien de ce que vous faites ici n’atteint le CRM principal.
      </span>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-full text-xs"
        onClick={() => reinitialiser.mutate()}
        disabled={occupe}
      >
        {reinitialiser.isPending
          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
        Réinitialiser
      </Button>

      <Button
        type="button"
        size="sm"
        className="h-8 rounded-full text-xs"
        onClick={() => basculer.mutate(false)}
        disabled={occupe}
      >
        {basculer.isPending
          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          : <LogOut className="mr-1.5 h-3.5 w-3.5" />}
        Retour au CRM principal
      </Button>
    </div>
  );
}

/** Le bouton d'entrée, pour les comptes autorisés uniquement. */
export function BoutonZoneTest({ reduit }: { reduit?: boolean }) {
  const { autorise, dedans, basculer } = useZoneTest();
  if (!autorise || dedans) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start rounded-lg text-xs text-muted-foreground hover:text-foreground"
      onClick={() => basculer.mutate(true)}
      disabled={basculer.isPending}
      title="Zone de test — données fictives"
    >
      {basculer.isPending
        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        : <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />}
      {!reduit && <span className="ml-2 truncate">Zone de test</span>}
    </Button>
  );
}
