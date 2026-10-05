import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la notification de documents nomme le client', async () => {
  const fonction = await read('supabase/functions/client-documents/index.ts');

  // « Documents client reçus » ne disait pas de quel client : il fallait
  // ouvrir la fiche pour le savoir.
  assert.match(fonction, /title: `Documents reçus — \$\{nomClient\}`/);
  assert.match(fonction, /\.select\('first_name, last_name, vehicle_make, vehicle_model, vehicle_registration'\)/);
  assert.doesNotMatch(fonction, /title: 'Documents client reçus'/);
});

test('un lead sans nom ne produit pas une notification muette', async () => {
  const fonction = await read('supabase/functions/client-documents/index.ts');

  assert.match(fonction, /\|\| 'Client sans nom'/);
});

test("le vehicule distingue deux dossiers d'une meme personne", async () => {
  const fonction = await read('supabase/functions/client-documents/index.ts');

  assert.match(fonction, /const precisions = \[vehicule, plaque\]\.filter\(Boolean\)\.join\(' · '\)/);
});

test("le push sur ecran verrouille ne nomme toujours personne", async () => {
  const push = await read('supabase/functions/web-push/index.ts');

  // Decision deliberee : un nom de client ne doit pas s'afficher sur un
  // telephone verrouille, meme si la notification en base le porte.
  const bloc = push.slice(push.indexOf('const safePushByType'));
  assert.match(bloc, /documents_received: \{\s*\n\s*title: 'Documents client reçus'/);
  assert.doesNotMatch(bloc.slice(0, bloc.indexOf('};')), /nomClient|first_name|last_name/);
});
