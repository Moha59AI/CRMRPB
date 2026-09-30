import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un onglet ouvert apprend qu une version plus recente est en ligne', async () => {
  const veille = await read('src/lib/nouvelle-version.ts');
  const app = await read('src/App.tsx');

  assert.match(veille, /script\[type="module"\]\[src\]/);
  assert.match(veille, /cache: 'no-store'/);
  assert.match(veille, /visibilityState !== 'visible'/);
  assert.match(app, /surveillerNouvelleVersion/);
});

test('la verification passe par le reseau, jamais par le cache du worker', async () => {
  const worker = await read('public/sw.js');

  // Hors navigation, la coquille ne doit pas sortir du cache : c'est elle qui
  // porte le nom du script courant.
  assert.match(worker, /url\.pathname === '\/index\.html'\) return;/);
  const positionCoquille = worker.indexOf("url.pathname === '/index.html'");
  const positionCache = worker.indexOf('const enCache = await cache.match(req)');
  assert.ok(positionCoquille > 0 && positionCoquille < positionCache);
});

test('le rechargement reste une decision de l utilisateur', async () => {
  const app = await read('src/App.tsx');

  assert.match(app, /label: 'Recharger'/);
  assert.match(app, /duration: Infinity/);
});
