import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrouillon } from './use-brouillon';

interface Fiche {
  id: string;
  nom: string | null;
  ville: string | null;
  montant: number | null;
  actif: boolean;
}

const SOURCE: Fiche = {
  id: 'l1', nom: 'Dupont', ville: null, montant: 120, actif: true,
};

describe('useBrouillon', () => {
  it('ne renvoie que les champs réellement changés', () => {
    const { result } = renderHook(() => useBrouillon<Fiche>(SOURCE, SOURCE.id));

    act(() => result.current.modifier({ nom: 'Durand' }));

    // On n'envoie pas les colonnes qu'on n'a pas touchees : deux personnes
    // peuvent travailler sur la meme fiche.
    expect(result.current.modifications).toEqual({ nom: 'Durand' });
    expect(result.current.valeur).toEqual({ ...SOURCE, nom: 'Durand' });
    expect(result.current.estModifie).toBe(true);
  });

  it('oublie une modification revenue à sa valeur d’origine', () => {
    const { result } = renderHook(() => useBrouillon<Fiche>(SOURCE, SOURCE.id));

    act(() => result.current.modifier({ nom: 'Durand' }));
    expect(result.current.estModifie).toBe(true);

    act(() => result.current.modifier({ nom: 'Dupont' }));

    // Taper puis effacer ne doit pas laisser la fiche « modifiee » et
    // declencher un avertissement a la fermeture pour rien.
    expect(result.current.estModifie).toBe(false);
    expect(result.current.modifications).toEqual({});
  });

  it('traite null et undefined comme la même absence de valeur', () => {
    const { result } = renderHook(() => useBrouillon<Fiche>(SOURCE, SOURCE.id));

    // `ville` vaut deja null cote source : le repasser a null n'est pas une
    // modification, sans quoi ouvrir une fiche la marquerait sale.
    act(() => result.current.modifier({ ville: null }));
    expect(result.current.estModifie).toBe(false);
  });

  it('cumule plusieurs champs', () => {
    const { result } = renderHook(() => useBrouillon<Fiche>(SOURCE, SOURCE.id));

    act(() => result.current.modifier({ nom: 'Durand' }));
    act(() => result.current.modifier({ montant: 0 }));
    act(() => result.current.modifier({ actif: false }));

    expect(result.current.champsModifies.sort()).toEqual(['actif', 'montant', 'nom']);
    // 0 et false sont des valeurs, pas des absences.
    expect(result.current.modifications).toEqual({ nom: 'Durand', montant: 0, actif: false });
  });

  it('vide le brouillon quand on change de fiche', () => {
    const { result, rerender } = renderHook(
      ({ source, cle }) => useBrouillon<Fiche>(source, cle),
      { initialProps: { source: SOURCE, cle: 'l1' } },
    );

    act(() => result.current.modifier({ nom: 'Durand' }));
    expect(result.current.estModifie).toBe(true);

    const suivante: Fiche = { id: 'l2', nom: 'Martin', ville: 'Lille', montant: null, actif: true };
    rerender({ source: suivante, cle: 'l2' });

    // Enchainer vingt dossiers ne doit jamais reporter la saisie du precedent.
    expect(result.current.estModifie).toBe(false);
    expect(result.current.valeur).toEqual(suivante);
  });

  it('conserve la saisie quand la source est rafraîchie sans changer de fiche', () => {
    const { result, rerender } = renderHook(
      ({ source, cle }) => useBrouillon<Fiche>(source, cle),
      { initialProps: { source: SOURCE, cle: 'l1' } },
    );

    act(() => result.current.modifier({ nom: 'Durand' }));

    // Une invalidation TanStack Query renvoie un nouvel objet pour la meme
    // fiche : perdre la saisie a ce moment-la serait invisible et brutal.
    rerender({ source: { ...SOURCE }, cle: 'l1' });

    expect(result.current.estModifie).toBe(true);
    expect(result.current.valeur?.nom).toBe('Durand');
  });

  it('annuler rétablit la source, vider ne fait qu’oublier', () => {
    const { result } = renderHook(() => useBrouillon<Fiche>(SOURCE, SOURCE.id));

    act(() => result.current.modifier({ nom: 'Durand' }));
    act(() => result.current.annuler());
    expect(result.current.valeur).toEqual(SOURCE);

    act(() => result.current.modifier({ nom: 'Martin' }));
    act(() => result.current.vider());
    expect(result.current.estModifie).toBe(false);
  });

  it('supporte une source absente pendant le chargement', () => {
    const { result } = renderHook(() => useBrouillon<Fiche>(undefined, undefined));

    expect(result.current.valeur).toBeUndefined();
    expect(result.current.estModifie).toBe(false);

    act(() => result.current.modifier({ nom: 'Durand' }));
    // Sans source, on ne peut pas comparer : la saisie est retenue telle quelle.
    expect(result.current.modifications).toEqual({ nom: 'Durand' });
  });
});
