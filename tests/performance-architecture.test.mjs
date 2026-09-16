import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les fonctionnalites sont chargees par route et non dans le demarrage du CRM', async () => {
  const app = await read('src/App.tsx');
  const routes = await read('src/app/app-routes.tsx');

  assert.match(app, /from '@\/app\/app-routes'/);
  assert.doesNotMatch(app, /features\/(marketing|finance|calendar)\//);
  assert.match(routes, /lazy\(\(\) => import\('@\/features\/marketing\/marketing-page'\)/);
  assert.match(routes, /lazy\(\(\) => import\('@\/features\/finance\/financial-dashboard-page'\)/);
  assert.match(routes, /lazy\(\(\) => import\('@\/features\/calendar\/calendar-page'\)/);
  assert.match(routes, /<Suspense fallback=/);
  assert.match(routes, /import\.meta\.env\.DEV/);
});

test("l'adresse existante ne declenche aucune recherche avant une interaction", async () => {
  const champ = await read('src/components/ChampAdresse.tsx');

  assert.match(champ, /interactionUtilisateur/);
  assert.match(champ, /if \(desactive \|\| !interactionUtilisateur\) return/);
  assert.match(champ, /setInteractionUtilisateur\(true\)/);
  assert.match(champ, /setInteractionUtilisateur\(false\)/);
});

test("un ancien onglet recupere automatiquement les modules remplaces par un deploiement", async () => {
  const boundary = await read('src/components/ErrorBoundary.tsx');

  assert.match(boundary, /failed to fetch dynamically imported module/i);
  assert.match(boundary, /chunkloaderror/i);
  assert.match(boundary, /window\.sessionStorage\.getItem\(MODULE_RELOAD_KEY\)/);
  assert.match(boundary, /MODULE_RELOAD_COOLDOWN_MS/);
  assert.match(boundary, /window\.location\.reload\(\)/);
});
