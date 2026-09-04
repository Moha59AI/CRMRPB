import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les relances sont pilotees par priorite et une session conserve le tri choisi', async () => {
  const page = await read('src/features/relances/relances-page.tsx');
  assert.match(page, /useState<RelanceSort>\('priorite'\)/);
  assert.match(page, /<ResumeRelances/);
  assert.doesNotMatch(page, /\.\.\.filtresRequete, sort: 'plus_recent'/);
});

test('un rappel peut recevoir une echeance exacte et explique son effet', async () => {
  const dialogue = await read('src/features/relances/components/dialogue-resultat-appel.tsx');
  assert.match(dialogue, /type="datetime-local"/);
  assert.match(dialogue, /Après validation/);
  assert.match(dialogue, /new Date\(datePersonnalisee\)\.toISOString\(\)/);
});

test('la fiche client rassemble le suivi de toutes les interventions', async () => {
  const fiche = await read('src/features/client/client-modal.tsx');
  const service = await read('src/services/contacts-service.ts');
  assert.match(fiche, /Suivi & échanges/);
  assert.match(fiche, /<PilotageClient/);
  assert.match(service, /fetchSuiviClient/);
  assert.match(service, /\.in\('lead_id', leadIds\)/);
});

test('les ecritures client levent les erreurs au lieu de declencher un faux succes', async () => {
  const service = await read('src/services/contacts-service.ts');
  assert.match(service, /export async function createContact[\s\S]*if \(error\) throw new Error/);
  assert.match(service, /export async function updateContact[\s\S]*if \(error\) throw new Error/);
  assert.match(service, /export async function creerInterventionPourClient[\s\S]*if \(error\) throw new Error/);
});

test('les leads de plus de deux jours sont archives uniquement apres selection manuelle', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const service = await read('src/services/leads-service.ts');
  assert.match(page, /À archiver \(\+2 jours\)/);
  assert.match(page, /<GestionArchives/);
  assert.match(page, /selectionArchives/);
  assert.match(service, /plusVieuxQueJours/);
  assert.match(service, /archiverLeadsSelectionnes/);
  assert.match(service, /desarchiverLeadsSelectionnes/);
  assert.match(service, /nombre !== leadIds\.length/);
});

test('un lead peut aussi etre archive depuis la file et la session de relances', async () => {
  const page = await read('src/features/relances/relances-page.tsx');
  const ligne = await read('src/features/relances/components/relance-row.tsx');
  const session = await read('src/features/relances/components/session-relance.tsx');
  assert.match(page, /archiverLeadsSelectionnes/);
  assert.match(page, /Archiver \{nbLeadsSelectionnes\}/);
  assert.match(ligne, /title="Archiver ce lead"/);
  assert.match(session, /archiverLeadsSelectionnes\(\[relance\.leadId\]\)/);
  assert.match(session, /touche: 'V', libelle: 'Archiver'/);
});
