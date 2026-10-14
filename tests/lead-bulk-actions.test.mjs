import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les fiches actives sont selectionnables dans chaque vue leads', async () => {
  const page = await read('src/features/leads/leads-page.tsx');

  assert.match(page, /const \[selectionLeads, setSelectionLeads\] = useState<Set<string>>/);
  assert.match(page, /<LeadsTable[\s\S]*selection=\{selectionLeads\}/);
  assert.match(page, /<ListeMobile[\s\S]*selection=\{selectionLeads\}/);
  assert.match(page, /<KanbanBoard[\s\S]*selection=\{selectionLeads\}/);
  assert.match(page, /<CompactList[\s\S]*selection=\{selectionLeads\}/);
});

test('la barre de lot exclut les etapes automatiques et confirme les sorties du parcours', async () => {
  const component = await read('src/features/leads/bulk-lead-actions.tsx');

  assert.match(component, /leadJourneyStages\.filter\(\(stage\) => !stage\.automated\)\.map/);
  assert.match(component, /Déplacer \{selectionCount\} fiche/);
  assert.match(component, /destination\?\.terminal/);
  assert.match(component, /sortiront du parcours actif et des relances/);
  assert.match(component, /Confirmer le changement/);
});

test('le changement de statut en lot detecte toute ecriture partielle', async () => {
  const service = await read('src/services/leads-service.ts');

  assert.match(service, /export async function changerStatutLeadsSelectionnes/);
  assert.match(service, /\.update\(\{ status \}\)/);
  assert.match(service, /\.in\('id', idsUniques\)/);
  assert.match(service, /\.is\('archived_at', null\)/);
  assert.match(service, /\.select\('id'\)/);
  assert.match(service, /if \(error\) throw new Error\(error\.message\)/);
  assert.match(service, /if \(nombre !== idsUniques\.length\)/);
});

test('un succes rafraichit leads et relances puis vide la selection', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const debut = page.indexOf('const updateStatusLotMutation');
  const fin = page.indexOf('const mutationArchives', debut);
  const mutation = page.slice(debut, fin);

  assert.match(mutation, /changerStatutLeadsSelectionnes/);
  assert.match(mutation, /queryKey: \['leads'\]/);
  assert.match(mutation, /queryKey: \['relances'\]/);
  assert.match(mutation, /setSelectionLeads\(new Set\(\)\)/);
  assert.match(mutation, /onError: \(err: Error\) => toast\.error/);
});
