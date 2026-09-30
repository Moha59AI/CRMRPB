/**
 * Mouvement d'interface, et le droit de s'en passer.
 *
 * Un chiffre qui monte et une courbe qui se trace disent « c'est frais, ça
 * vient d'arriver ». Mais le mouvement n'est pas gratuit : il gêne, et parfois
 * il rend malade. Le systeme d'exploitation porte deja la reponse --
 * `prefers-reduced-motion` -- et on la respecte partout plutot que d'ajouter
 * un reglage de plus.
 *
 * Quand l'animation est refusee, on n'anime pas : on affiche tout de suite la
 * valeur finale. Jamais d'ecran vide ni de zero fige.
 */

import { useEffect, useRef, useState } from 'react';

export function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const suivre = () => setReduit(media.matches);
    media.addEventListener('change', suivre);
    return () => media.removeEventListener('change', suivre);
  }, []);

  return reduit;
}

/** Depart lent, fin douce : le mouvement d'une valeur qui se pose. */
function adouci(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Fait monter un nombre jusqu'a sa valeur.
 *
 * Utilise `requestAnimationFrame` plutot qu'un intervalle : le navigateur
 * suspend l'animation quand l'onglet passe en arriere-plan, et la reprend
 * sans avoir accumule de retard.
 */
export function useNombreAnime(cible: number, duree = 900): number {
  const reduit = useMouvementReduit();
  const [valeur, setValeur] = useState(reduit ? cible : 0);
  const depart = useRef(0);

  useEffect(() => {
    if (reduit || !Number.isFinite(cible)) {
      setValeur(cible);
      return;
    }

    const initiale = depart.current;
    let image = 0;
    let debut: number | null = null;

    const pas = (horodatage: number) => {
      if (debut === null) debut = horodatage;
      const avancement = Math.min(1, (horodatage - debut) / duree);
      setValeur(initiale + (cible - initiale) * adouci(avancement));
      if (avancement < 1) image = requestAnimationFrame(pas);
      else depart.current = cible;
    };

    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [cible, duree, reduit]);

  return valeur;
}
