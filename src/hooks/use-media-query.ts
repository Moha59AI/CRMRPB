import { useEffect, useState } from 'react';

/**
 * Suit une media query.
 *
 * Utile quand la difference entre mobile et bureau ne se règle pas en CSS :
 * afficher deux arbres React et en masquer un avec `hidden md:block` doublerait
 * le rendu, ce qui compte sur une liste de plusieurs centaines de lignes.
 *
 * L'état initial est lu de façon synchrone : partir de `false` puis corriger
 * au premier effet ferait clignoter la mise en page à chaque chargement.
 */
export function useMediaQuery(query: string): boolean {
  const [correspond, setCorrespond] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const auChangement = (e: MediaQueryListEvent) => setCorrespond(e.matches);

    // La valeur a pu changer entre le premier rendu et cet effet — rotation
    // de l'écran, fenêtre redimensionnée pendant le chargement.
    setCorrespond(mql.matches);
    mql.addEventListener('change', auChangement);
    return () => mql.removeEventListener('change', auChangement);
  }, [query]);

  return correspond;
}

/** Sous le point de rupture `md` de Tailwind, celui qui masque la barre latérale. */
export function useEstMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
