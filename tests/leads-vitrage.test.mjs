import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le vitrage est visible dans toutes les vues de la liste des leads', async () => {
  const page = await read('src/features/leads/leads-page.tsx');

  assert.match(page, /<TableHead className="text-xs">Vitrage<\/TableHead>/);
  assert.ok(
    (page.match(/vitrageLabel\(lead\)/g) ?? []).length >= 4,
    'le libelle vitrage doit etre rendu sur mobile, tableau, kanban et liste compacte',
  );
});

test('un nouveau lead peut enregistrer son type de vitrage', async () => {
  const page = await read('src/features/leads/leads-page.tsx');

  assert.match(page, /glass_type: null as GlassType \| null/);
  assert.match(page, /Vitrage concerné/);
  assert.match(page, /Object\.entries\(LIBELLE_VITRAGE\)/);
  assert.match(page, /glass_type: value as GlassType/);
});
