import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les lignes NRP sont rouges claires et les lignes perdues gris noir clair', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const debut = page.indexOf('function couleurLigneLead');
  const fin = page.indexOf('// ============ VIEW TOGGLE BUTTON', debut);
  const couleur = page.slice(debut, fin);

  assert.match(couleur, /status === 'nrp'[\s\S]*bg-destructive\/\[0\.08\]/);
  assert.match(couleur, /status === 'lost'[\s\S]*bg-foreground\/\[0\.045\]/);
});

test('la couleur couvre le tableau et la liste mobile sans masquer la selection', async () => {
  const page = await read('src/features/leads/leads-page.tsx');

  assert.equal(
    (page.match(/couleurLigneLead\(lead\.status, selection\.has\(lead\.id\)\)/g) ?? []).length,
    2,
  );
  assert.match(page, /if \(selectionnee\) return 'bg-primary\/\[0\.08\]/);
});

test('le pipeline reprend NRP en rouge clair et Perdu en gris noir clair', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const debut = page.indexOf('function couleurEntetePipeline');
  const fin = page.indexOf('// ============ VIEW TOGGLE BUTTON', debut);
  const couleursPipeline = page.slice(debut, fin);

  assert.match(couleursPipeline, /stage === 'nrp'[\s\S]*bg-destructive\/\[0\.08\]/);
  assert.match(couleursPipeline, /stage === 'perdu'[\s\S]*bg-foreground\/\[0\.055\]/);
  assert.match(couleursPipeline, /status === 'nrp'[\s\S]*bg-destructive\/\[0\.08\]/);
  assert.match(couleursPipeline, /status === 'lost'[\s\S]*bg-foreground\/\[0\.045\]/);
  assert.match(page, /couleurEntetePipeline\(stage\.key, dragOverColumn === stage\.key\)/);
  assert.match(page, /couleurCartePipeline\(lead\.status, selectionne === true\)/);
});
