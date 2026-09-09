import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la rentabilite Google rapproche les leads, dossiers, factures et avoirs sans inventer de campagne', async () => {
  const service = await read('src/features/marketing/marketing-service.ts');

  assert.match(service, /source\.eq\.google_ads/);
  assert.match(service, /function reconcileFinance/);
  assert.match(service, /caseToLead/);
  assert.match(service, /leadForContact/);
  assert.match(service, /candidateLeads/);
  assert.match(service, /candidate && leadById\.has\(candidate\.id\)/);
  assert.match(service, /creditedRevenue/);
  assert.match(service, /Google Ads — campagne non identifiée/);
  assert.doesNotMatch(service, /spend\s*\/\s*channels/);
});

test('la page expose le ROAS, la marge apres publicite et les canaux Google', async () => {
  const page = await read('src/features/marketing/marketing-page.tsx');

  assert.match(page, /Rentabilité Google Ads rapprochée au CRM/);
  assert.match(page, /ROAS CRM/);
  assert.match(page, /Marge connue après pub/);
  assert.match(page, /Résultat par origine du lead Google/);
  assert.match(page, /Les dépenses restent au niveau campagne/);
  assert.match(page, /Formulaires \/ webhook|channel\.label/);
});
