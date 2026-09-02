import { describe, it, expect } from 'vitest';
import { formaterDelai, decomposer, enMinutes } from './cadences-service';

const HEURE = 60;
const JOUR = 1440;

describe('formaterDelai', () => {
  it('nomme les deux cas particuliers plutôt que d’afficher un nombre', () => {
    // « 0 min » laisserait croire a un delai tres court ; « null » ne dit rien.
    expect(formaterDelai(0)).toBe('Immédiat');
    expect(formaterDelai(null)).toBe('Sort de la file');
  });

  it('compose les unités dans l’ordre décroissant', () => {
    expect(formaterDelai(2 * HEURE)).toBe('2 h');
    expect(formaterDelai(JOUR)).toBe('1 j');
    expect(formaterDelai(7 * JOUR)).toBe('7 j');
    expect(formaterDelai(90)).toBe('1 h 30 min');
    expect(formaterDelai(JOUR + 3 * HEURE)).toBe('1 j 3 h');
  });

  it('garde l’unité explicite sur un écran de réglages', () => {
    // « 1 h 30 » se lit comme une heure ; ici on saisit des durees, l'unite
    // doit rester visible.
    expect(formaterDelai(90)).toContain('min');
  });
});

describe('decomposer', () => {
  it('choisit l’unité la plus lisible', () => {
    // Afficher « 10 080 minutes » plutot que « 7 jours » rendrait le champ
    // inutilisable : personne ne verifie une cadence en minutes.
    expect(decomposer(7 * JOUR)).toEqual({ valeur: 7, unite: 'jours' });
    expect(decomposer(2 * HEURE)).toEqual({ valeur: 2, unite: 'heures' });
    expect(decomposer(45)).toEqual({ valeur: 45, unite: 'minutes' });
  });

  it('privilégie le jour à l’heure quand les deux tombent juste', () => {
    expect(decomposer(JOUR)).toEqual({ valeur: 1, unite: 'jours' });
  });

  it('retombe sur les minutes pour une durée qui ne tombe pas rond', () => {
    expect(decomposer(90)).toEqual({ valeur: 90, unite: 'minutes' });
    expect(decomposer(JOUR + 1)).toEqual({ valeur: JOUR + 1, unite: 'minutes' });
  });

  it('traite zéro et la sortie de file sans unité trompeuse', () => {
    expect(decomposer(0)).toEqual({ valeur: 0, unite: 'minutes' });
    expect(decomposer(null)).toEqual({ valeur: 0, unite: 'minutes' });
  });
});

describe('enMinutes', () => {
  it('reconvertit sans perte', () => {
    for (const minutes of [0, 45, 90, 2 * HEURE, JOUR, 3 * JOUR, 7 * JOUR]) {
      const { valeur, unite } = decomposer(minutes);
      expect(enMinutes(valeur, unite)).toBe(minutes);
    }
  });

  it('applique le bon facteur', () => {
    expect(enMinutes(2, 'heures')).toBe(120);
    expect(enMinutes(3, 'jours')).toBe(4320);
    expect(enMinutes(15, 'minutes')).toBe(15);
  });
});

describe('les valeurs par défaut de la cadence NRP', () => {
  it('se relisent telles qu’elles étaient codées en dur', () => {
    // La migration reprend a l'identique 2 h, 1 j, 3 j, 7 j : aucune file ne
    // doit bouger le jour ou elle est appliquee.
    expect(formaterDelai(2 * HEURE)).toBe('2 h');
    expect(formaterDelai(1 * JOUR)).toBe('1 j');
    expect(formaterDelai(3 * JOUR)).toBe('3 j');
    expect(formaterDelai(7 * JOUR)).toBe('7 j');
    expect(formaterDelai(null)).toBe('Sort de la file');
  });
});
