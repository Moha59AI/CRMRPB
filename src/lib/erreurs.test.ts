import { describe, it, expect } from 'vitest';
import { messageErreurBase } from './erreurs';

describe('messageErreurBase', () => {
  it('désigne la migration manquante quand une colonne est absente', () => {
    const m = messageErreurBase('column leads.geo_precision does not exist');
    expect(m).toContain('geo_precision');
    expect(m).toContain('migration');
  });

  it('reconnaît la forme PostgREST du cache de schéma', () => {
    // PostgREST ne dit pas « does not exist » mais se plaint de ne pas trouver
    // la colonne : c'est pourtant le meme diagnostic.
    const m = messageErreurBase(
      "Could not find the 'citycode' column of 'leads' in the schema cache",
    );
    expect(m).toContain('citycode');
    expect(m).toContain('migration');
  });

  it('distingue un refus de droits d’une colonne manquante', () => {
    // Les confondre fait chercher un probleme de droits la ou il manque une
    // colonne, et inversement.
    expect(messageErreurBase('new row violates row-level security policy'))
      .toBe('Votre rôle ne permet pas cette modification.');
    expect(messageErreurBase('permission denied for table leads'))
      .toBe('Votre rôle ne permet pas cette modification.');
  });

  it('nomme la contrainte refusée', () => {
    const m = messageErreurBase(
      'new row for relation "leads" violates check constraint "leads_status_check"',
    );
    expect(m).toContain('leads_status_check');
  });

  it('laisse passer un message qu’il ne sait pas traduire', () => {
    // Mieux vaut un message brut qu'une reformulation qui perdrait l'information.
    expect(messageErreurBase('connexion interrompue')).toBe('connexion interrompue');
  });
});
