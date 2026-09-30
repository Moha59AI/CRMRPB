import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la liste des clients ne se coupe plus au 200e contact', async () => {
  const service = await read('src/services/contacts-service.ts');

  // Le plafond silencieux cachait 94 clients sur 136.
  assert.doesNotMatch(service, /\.limit\(200\)/);
  assert.match(service, /\.range\(debut, debut \+ TAILLE_PAGE - 1\)/);
});

test('la pagination ne se fie pas a la taille demandee', async () => {
  const service = await read('src/services/contacts-service.ts');

  // PostgREST peut rendre une page plus courte que demandee sans etre au
  // bout : on avance du nombre recu, on s'arrete sur une page vide.
  assert.match(service, /if \(page\.length === 0\) break;/);
  assert.match(service, /debut \+= page\.length;/);
  assert.doesNotMatch(service, /if \(page\.length < TAILLE_PAGE\) break;/);
});

test('une recherche ne casse pas le filtre PostgREST', async () => {
  const service = await read('src/services/contacts-service.ts');

  // La virgule et les parentheses sont la grammaire de `or()`.
  assert.match(service, /function rechercheSure/);
  assert.match(service, /replace\(\/\[,\(\)\*\\\\\]\/g, ' '\)/);
});
