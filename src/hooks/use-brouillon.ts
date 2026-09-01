import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Brouillon d'édition : les modifications restent locales jusqu'à
 * l'enregistrement explicite.
 *
 * Les fiches enregistraient chaque champ à sa sortie. C'était rapide au
 * téléphone, mais sans filet : aucune annulation possible, aucune confirmation
 * que l'écriture avait eu lieu, et une frappe accidentelle partait en base
 * sans que personne ne le voie.
 *
 * Ce que ce hook garantit :
 *
 * - **Seuls les champs réellement changés sont envoyés.** On n'écrase pas des
 *   colonnes qu'on n'a pas touchées — ce qui compte quand deux personnes
 *   travaillent sur la même fiche.
 *
 * - **Revenir à la valeur d'origine annule la modification.** Taper puis
 *   effacer ne doit pas laisser la fiche « modifiée » et déclencher un
 *   avertissement à la fermeture pour rien.
 *
 * - **Changer de fiche vide le brouillon.** Enchaîner les dossiers ne doit
 *   jamais reporter la saisie du précédent sur le suivant.
 */

/** Egalite suffisante pour des colonnes SQL : scalaires, null, dates ISO. */
function memeValeur(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // null et undefined designent tous deux « pas de valeur » cote base.
  if (a == null && b == null) return true;
  return false;
}

export interface Brouillon<T extends object> {
  /** La source, recouverte des modifications en cours. */
  valeur: T | undefined;
  /** Uniquement ce qui a changé — c'est ce qu'on envoie. */
  modifications: Partial<T>;
  /** Noms des champs modifiés, pour signaler lesquels. */
  champsModifies: (keyof T)[];
  estModifie: boolean;
  modifier: (updates: Partial<T>) => void;
  /** Rétablit la source. */
  annuler: () => void;
  /** Vide le brouillon sans rétablir : à appeler après un enregistrement réussi. */
  vider: () => void;
}

export function useBrouillon<T extends object>(
  source: T | undefined,
  /** Identifie la fiche courante. Un changement vide le brouillon. */
  cle: string | undefined,
): Brouillon<T> {
  const [modifications, setModifications] = useState<Partial<T>>({});
  const cleActuelle = useRef(cle);

  // Passer au dossier suivant ne doit pas reporter la saisie du precedent.
  useEffect(() => {
    if (cleActuelle.current !== cle) {
      cleActuelle.current = cle;
      setModifications({});
    }
  }, [cle]);

  const modifier = useCallback((updates: Partial<T>) => {
    setModifications((courant) => {
      const suite = { ...courant, ...updates };

      // Un champ revenu a sa valeur d'origine n'est plus une modification.
      if (source) {
        for (const nom of Object.keys(updates) as (keyof T)[]) {
          if (memeValeur(suite[nom], source[nom])) {
            delete suite[nom];
          }
        }
      }

      return suite;
    });
  }, [source]);

  const annuler = useCallback(() => setModifications({}), []);
  const vider = useCallback(() => setModifications({}), []);

  const valeur = useMemo(
    () => (source ? { ...source, ...modifications } : undefined),
    [source, modifications],
  );

  const champsModifies = useMemo(
    () => Object.keys(modifications) as (keyof T)[],
    [modifications],
  );

  return {
    valeur,
    modifications,
    champsModifies,
    estModifie: champsModifies.length > 0,
    modifier,
    annuler,
    vider,
  };
}

/**
 * Avertit avant de quitter la page avec des modifications non enregistrées.
 *
 * Ne couvre que la fermeture de l'onglet et le rechargement : la navigation
 * interne de React Router ne déclenche pas `beforeunload`, et se garde à
 * l'endroit qui contrôle la fermeture.
 */
export function useAvertirSiModifie(actif: boolean): void {
  useEffect(() => {
    if (!actif) return;

    const avant = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Les navigateurs ignorent le message depuis des annees, mais exigent
      // toujours qu'une valeur soit affectee pour afficher leur propre dialogue.
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, [actif]);
}
