import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('chaque etape porte une couleur marquee et les documents recus sont verts', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const debut = page.indexOf('function couleurLigneLead');
  const fin = page.indexOf('// ============ VIEW TOGGLE BUTTON', debut);
  const couleur = page.slice(debut, fin);

  assert.match(couleur, /status === 'documents_received'[\s\S]*border-emerald-500[\s\S]*bg-emerald-100\/70/);
  assert.match(couleur, /status === 'nrp'[\s\S]*border-red-500[\s\S]*bg-red-100\/70/);
  assert.match(couleur, /status === 'lost'[\s\S]*border-slate-500[\s\S]*bg-slate-200\/65/);
  assert.match(couleur, /status === 'documents_requested'[\s\S]*border-orange-400/);
  assert.match(couleur, /status === 'appointment_scheduled'[\s\S]*border-blue-500/);
});

test('la couleur couvre le tableau et la liste mobile sans masquer la selection', async () => {
  const page = await read('src/features/leads/leads-page.tsx');

  assert.equal(
    (page.match(/couleurLigneLead\(lead\.status,/g) ?? []).length,
    3,
  );
  assert.match(page, /if \(selectionnee\) return 'border-l-4 border-primary/);
});

test('le pipeline reprend toutes les couleurs et distingue les documents recus', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const debut = page.indexOf('function couleurEntetePipeline');
  const fin = page.indexOf('// ============ VIEW TOGGLE BUTTON', debut);
  const couleursPipeline = page.slice(debut, fin);

  assert.match(couleursPipeline, /stage === 'nouveau'[\s\S]*bg-sky-100\/70/);
  assert.match(couleursPipeline, /stage === 'nrp'[\s\S]*bg-red-100\/75/);
  assert.match(couleursPipeline, /stage === 'documents'[\s\S]*bg-orange-100\/70/);
  assert.match(couleursPipeline, /stage === 'perdu'[\s\S]*bg-slate-200\/70/);
  assert.match(couleursPipeline, /status === 'documents_received'[\s\S]*bg-emerald-100\/80/);
  assert.match(couleursPipeline, /status === 'nrp'[\s\S]*bg-red-100\/75/);
  assert.match(couleursPipeline, /status === 'lost'[\s\S]*bg-slate-200\/70/);
  assert.match(page, /couleurEntetePipeline\(stage\.key, dragOverColumn === stage\.key\)/);
  assert.match(page, /couleurCartePipeline\(lead\.status, selectionne === true\)/);
});

test('les badges ne confondent plus attente et reception complete des documents', async () => {
  const shared = await read('src/features/leads/lead-shared.ts');
  assert.match(shared, /documents_requested: 'bg-orange-100 text-orange-800 border-orange-300'/);
  assert.match(shared, /documents_received: 'bg-emerald-100 text-emerald-800 border-emerald-300'/);
  assert.match(shared, /lost: 'bg-slate-200 text-slate-800 border-slate-400'/);
});
