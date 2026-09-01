import { describe, it, expect } from 'vitest';
import {
  diagnostiquerMeta, diagnostiquerCron, niveauGlobal, formaterDuree,
} from './diagnostic';
import type { EtatCron, EtatMeta, EtatSysteme } from '@/services/admin-service';

const MAINTENANT = new Date('2026-09-01T12:00:00Z').getTime();
const ilYA = (ms: number) => new Date(MAINTENANT - ms).toISOString();

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

const meta = (p: Partial<EtatMeta> = {}): EtatMeta => ({
  en_attente: 0, en_erreur: 0, traites: 0, traites_24h: 0,
  dernier_recu: null, dernier_traite: null, ...p,
});

const cron = (p: Partial<EtatCron> = {}): EtatCron => ({
  planifie: true, derniere_execution: ilYA(MINUTE),
  dernier_statut: 'succeeded', dernier_message: null, echecs_recents: 0, ...p,
});

describe('diagnostiquerMeta', () => {
  it('signale une file bloquée quand le traitement échoue', () => {
    const c = diagnostiquerMeta(
      meta({ en_attente: 28, dernier_recu: ilYA(16 * HEURE) }),
      cron({ dernier_statut: 'failed', echecs_recents: 12 }),
      MAINTENANT,
    );

    expect(c.niveau).toBe('probleme');
    expect(c.titre).toBe('28 leads en attente');
    // Le message doit rassurer sur la conservation : c'est ce qui evite la panique.
    expect(c.detail).toContain('pas perdus');
    expect(c.action).toBeDefined();
  });

  it('reste sans action quand la file est pleine mais le traitement sain', () => {
    const c = diagnostiquerMeta(meta({ en_attente: 2 }), cron(), MAINTENANT);

    expect(c.niveau).toBe('probleme');
    expect(c.action).toBeUndefined();
  });

  it('accorde le singulier', () => {
    const c = diagnostiquerMeta(meta({ en_attente: 1 }), cron(), MAINTENANT);
    expect(c.titre).toBe('1 lead en attente');
  });

  it('distingue une absence totale de réception d’une file vide', () => {
    expect(diagnostiquerMeta(meta(), cron(), MAINTENANT).niveau).toBe('inactif');

    const actif = diagnostiquerMeta(
      meta({ traites: 134, dernier_recu: ilYA(2 * HEURE) }),
      cron(),
      MAINTENANT,
    );
    expect(actif.niveau).toBe('ok');
  });

  it('passe en attention sur des leads en échec', () => {
    const c = diagnostiquerMeta(
      meta({ en_erreur: 3, traites: 10, dernier_recu: ilYA(HEURE) }),
      cron(),
      MAINTENANT,
    );
    expect(c.niveau).toBe('attention');
    expect(c.titre).toBe('3 leads en échec');
  });

  it('signale une réception muette depuis plus d’une semaine', () => {
    const c = diagnostiquerMeta(
      meta({ traites: 50, dernier_recu: ilYA(10 * JOUR) }),
      cron(),
      MAINTENANT,
    );
    expect(c.niveau).toBe('attention');
    expect(c.titre).toBe('Aucune réception récente');
  });

  it('donne la priorité à la file sur les échecs', () => {
    const c = diagnostiquerMeta(
      meta({ en_attente: 5, en_erreur: 9 }),
      cron(),
      MAINTENANT,
    );
    expect(c.titre).toContain('en attente');
  });
});

describe('diagnostiquerCron', () => {
  it('signale une tâche absente', () => {
    const c = diagnostiquerCron({ planifie: null }, MAINTENANT);
    expect(c.niveau).toBe('probleme');
    expect(c.detail).toContain('indéfiniment');
  });

  it('remonte le message d’échec de la base', () => {
    const c = diagnostiquerCron(
      cron({ dernier_statut: 'failed', dernier_message: 'UNAUTHORIZED_INVALID_JWT_FORMAT' }),
      MAINTENANT,
    );
    expect(c.niveau).toBe('probleme');
    expect(c.detail).toBe('UNAUTHORIZED_INVALID_JWT_FORMAT');
  });

  it('détecte un ralentissement au-delà de quinze minutes', () => {
    expect(diagnostiquerCron(cron({ derniere_execution: ilYA(40 * MINUTE) }), MAINTENANT).niveau)
      .toBe('attention');
    expect(diagnostiquerCron(cron({ derniere_execution: ilYA(2 * MINUTE) }), MAINTENANT).niveau)
      .toBe('ok');
  });

  it('distingue une tâche planifiée jamais exécutée', () => {
    const c = diagnostiquerCron(cron({ derniere_execution: null }), MAINTENANT);
    expect(c.niveau).toBe('attention');
    expect(c.titre).toBe('Jamais exécuté');
  });
});

describe('niveauGlobal', () => {
  const base = (p: Partial<EtatSysteme> = {}): EtatSysteme => ({
    meta: meta({ traites: 10, dernier_recu: ilYA(HEURE) }),
    equipe: { membres: 1, par_role: {}, invitations_en_attente: 0, invitations_expirees: 0 },
    leads: { total: 0, recus_24h: 0, jamais_contactes: 0, convertis: 0 },
    cron: cron(),
    integrations: [],
    genere_a: new Date(MAINTENANT).toISOString(),
    ...p,
  });

  it('retient le constat le plus grave', () => {
    expect(niveauGlobal(base(), MAINTENANT)).toBe('ok');
    expect(niveauGlobal(base({ meta: meta({ en_attente: 4 }) }), MAINTENANT)).toBe('probleme');
  });

  it('remonte une intégration en erreur même si le reste va bien', () => {
    expect(
      niveauGlobal(base({
        integrations: [{
          provider: 'meta', nom: 'Meta Ads', statut: 'error',
          derniere_reussite: null, derniere_erreur: 'Jeton expiré',
        }],
      })),
    ).toBe('probleme');
  });

  it('renvoie inactif sans données', () => {
    expect(niveauGlobal(undefined)).toBe('inactif');
  });
});

describe('formaterDuree', () => {
  it('reste lisible à chaque échelle', () => {
    expect(formaterDuree(30_000)).toBe("à l'instant");
    expect(formaterDuree(5 * MINUTE)).toBe('il y a 5 min');
    expect(formaterDuree(3 * HEURE)).toBe('il y a 3 h');
    expect(formaterDuree(30 * HEURE)).toBe('hier');
    expect(formaterDuree(3 * JOUR)).toBe('il y a 3 jours');
  });
});
