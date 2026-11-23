import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le conseiller dispose de tout le poste commercial et rien de plus', async () => {
  const { CHEMINS_CONSEILLER, cheminAutorise } = await import('../src/config/permissions.ts');

  for (const chemin of [
    '/today',
    '/relances',
    '/leads',
    '/tasks',
    '/interventions/lead-123',
    '/contacts',
    '/clients/client-123',
    '/calendar',
    '/communications',
    '/emails',
  ]) {
    assert.equal(cheminAutorise(chemin, 'advisor'), true, chemin);
  }

  for (const chemin of [
    '/finance',
    '/billing',
    '/marketing',
    '/campaigns',
    '/workflows',
    '/outils/masquer-prix',
    '/settings',
    '/settings/users',
  ]) {
    assert.equal(cheminAutorise(chemin, 'advisor'), false, chemin);
  }

  assert.ok(CHEMINS_CONSEILLER.includes('/relances'));
  assert.ok(CHEMINS_CONSEILLER.includes('/tasks'));
});

test('la navigation du conseiller met les relances au premier plan', async () => {
  const [header, roles] = await Promise.all([
    read('src/components/DesktopTopHeader.tsx'),
    read('src/config/roles.ts'),
  ]);

  assert.match(header, /CHEMINS_PRINCIPAUX_CONSEILLER = \['\/today', '\/relances', '\/leads', '\/tasks', '\/calendar'\]/);
  assert.match(header, /role === 'advisor' \? CHEMINS_PRINCIPAUX_CONSEILLER/);
  assert.match(header, /roleLabels\[role\]/);
  assert.match(roles, /advisor: 'Appels, relances, leads, tâches, agenda, clients et messagerie'/);
});

test('l accueil conseiller remplace la finance par les priorites commerciales', async () => {
  const page = await read('src/features/today/today-page.tsx');

  assert.match(page, /function AccueilConseiller/);
  assert.match(page, /label="Appels à faire"/);
  assert.match(page, /label="Relances en retard"/);
  assert.match(page, /label="Documents à relancer"/);
  assert.match(page, /Démarrer mes relances/);
  assert.match(page, /enabled: !!profile && !estConseiller/);
  assert.match(page, /estConseiller \? \(/);
});

test('la base autorise le conseiller sur appels, taches et rendez-vous', async () => {
  const migration = await read('supabase/migrations/20260831140000_rls_par_role.sql');

  assert.match(migration, /\('appointments',[\s\S]*?'admin,manager,advisor'/);
  assert.match(migration, /\('tasks',[\s\S]*?'admin,manager,advisor'/);
  assert.match(migration, /\('communications',[\s\S]*?'admin,manager,advisor'/);
});
