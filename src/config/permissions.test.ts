import { describe, it, expect } from 'vitest';
import { cheminAutorise, accueilDuRole } from './permissions';

/**
 * La matrice cote interface. Elle ne protege rien par elle-meme -- les
 * politiques RLS le font -- mais une divergence entre les deux produit soit
 * des ecrans qui echouent, soit des actions proposees puis refusees.
 *
 * Voir supabase/tests/rls.sql pour la verification cote base.
 */
describe('matrice des roles', () => {
  it('reserve les integrations et les webhooks a l administrateur', () => {
    for (const role of ['manager', 'advisor', 'technician', 'accountant'] as const) {
      expect(cheminAutorise('/settings/integrations', role)).toBe(false);
      expect(cheminAutorise('/settings/integrations/meta', role)).toBe(false);
      expect(cheminAutorise('/settings/webhooks', role)).toBe(false);
      expect(cheminAutorise('/settings/users', role)).toBe(false);
    }
    expect(cheminAutorise('/settings/integrations', 'admin')).toBe(true);
  });

  it('ouvre les assureurs au responsable, pas au conseiller', () => {
    // La matrice donne l'ecriture sur `insurers` a l'administrateur et au
    // responsable ; le conseiller ne fait que lire, depuis la fiche dossier.
    expect(cheminAutorise('/settings/insurers', 'admin')).toBe(true);
    expect(cheminAutorise('/settings/insurers', 'manager')).toBe(true);
    for (const role of ['advisor', 'technician', 'accountant'] as const) {
      expect(cheminAutorise('/settings/insurers', role)).toBe(false);
    }
  });

  it('reserve les cadences a l administrateur et au responsable', () => {
    // Changer une cadence deplace la file de toute l'equipe : un conseiller
    // ne doit pas pouvoir la modifier, meme s'il la subit.
    expect(cheminAutorise('/settings/relances', 'admin')).toBe(true);
    expect(cheminAutorise('/settings/relances', 'manager')).toBe(true);
    expect(cheminAutorise('/settings/relances', 'advisor')).toBe(false);
  });

  it('laisse le chemin le plus specifique l emporter', () => {
    // /settings est ouvert au responsable, mais pas /settings/webhooks.
    expect(cheminAutorise('/settings', 'manager')).toBe(true);
    expect(cheminAutorise('/settings/webhooks', 'manager')).toBe(false);
  });

  it('tient le comptable a l ecart du commercial', () => {
    expect(cheminAutorise('/leads', 'accountant')).toBe(false);
    expect(cheminAutorise('/relances', 'accountant')).toBe(false);
    expect(cheminAutorise('/workflows', 'accountant')).toBe(false);
    expect(cheminAutorise('/billing', 'accountant')).toBe(true);
    expect(cheminAutorise('/contacts', 'accountant')).toBe(true);
  });

  it('limite le technicien a ses interventions et a son agenda', () => {
    expect(cheminAutorise('/calendar', 'technician')).toBe(true);
    expect(cheminAutorise('/interventions/abc', 'technician')).toBe(true);
    expect(cheminAutorise('/leads', 'technician')).toBe(false);
    expect(cheminAutorise('/billing', 'technician')).toBe(false);
    expect(cheminAutorise('/campaigns', 'technician')).toBe(false);
  });

  it('refuse tout a un compte sans profil', () => {
    // Un compte sans profil n'appartient a aucun espace : la RLS lui
    // refuserait tout, l'interface doit s'aligner.
    expect(cheminAutorise('/today', null)).toBe(false);
    expect(cheminAutorise('/leads', null)).toBe(false);
  });

  it('ouvre tout a l administrateur', () => {
    for (const chemin of ['/today', '/leads', '/billing', '/settings/webhooks', '/calendar']) {
      expect(cheminAutorise(chemin, 'admin')).toBe(true);
    }
  });

  it('redirige chaque role vers un accueil qui lui est accessible', () => {
    // Sans cela, la redirection renverrait vers un ecran refuse, donc en boucle.
    for (const role of ['admin', 'manager', 'advisor', 'technician', 'accountant'] as const) {
      expect(cheminAutorise(accueilDuRole(role), role)).toBe(true);
    }
  });
});
