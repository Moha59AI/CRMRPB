import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261013110000_onify_glass_cases.sql';
const INSURER_MIGRATION = 'supabase/migrations/20261013123000_onify_glass_insurer_matching.sql';

test('les dossiers Glass sont importés en lecture seule avec leur identité Onify', async () => {
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(sync, /listAll<OnifyGlassCase>\(token, '\/recovery\/cases'/);
  assert.match(sync, /onify_glass_case_id: onifyId/);
  assert.match(sync, /contactIds\.get\(String\(item\.client\.contact_id\)\)/);
  assert.match(sync, /onify_payload: item/);
  assert.match(sync, /glass_last_sync_at/);
  assert.match(sync, /listAll<OnifyGlassCase>\(token, '\/recovery\/cases', glassUpdatedSince\)/);

  const helperStart = sync.indexOf('async function onifyGet');
  const helperEnd = sync.indexOf('function unwrapPage');
  const onifyRequest = sync.slice(helperStart, helperEnd);
  assert.match(onifyRequest, /method: 'GET'/);
  assert.doesNotMatch(onifyRequest, /method: '(POST|PUT|PATCH|DELETE)'/);
});

test('la migration conserve les statuts, le véhicule, le sinistre et les vitrages Glass', async () => {
  const sql = await read(MIGRATION);

  for (const column of [
    'onify_status_code',
    'onify_work_status_code',
    'onify_payment_status',
    'onify_vehicle_registration',
    'onify_insurer_name',
    'insurance_claim_date',
    'onify_glass_items',
    'onify_payload',
  ]) assert.match(sql, new RegExp(column));
  assert.match(sql, /windscreen_cases_onify_glass_unique/);
  assert.match(sql, /grant execute on function public\.rattacher_dossiers_glass\(uuid\) to service_role/);
  assert.match(sql, /having count\(\*\) = 1/);
  assert.doesNotMatch(sql, /min\(l\.id\)/);
});

test('Glass complète les fiches sans écraser les saisies du CRM', async () => {
  const sql = await read(MIGRATION);
  const matching = await read(INSURER_MIGRATION);

  assert.match(sql, /coalesce\(nullif\(trim\(l\.vehicle_registration\), ''\), x\.onify_vehicle_registration\)/);
  assert.match(sql, /coalesce\(nullif\(trim\(l\.insurance\), ''\), x\.onify_insurer_name\)/);
  assert.match(sql, /coalesce\(l\.glass_type, x\.glass_type\)/);
  assert.match(sql, /lower\(trim\(a\.name\)\) = lower\(trim\(d\.onify_insurer_name\)\)/);
  assert.match(matching, /length\(trim\(a\.name\)\) >= 3/);
  assert.match(matching, /Aucun assureur n'est créé automatiquement/);
  assert.match(matching, /grant execute on function public\.rapprocher_assureurs_glass\(uuid\) to service_role/);
});

test('la fiche dossier affiche le suivi Glass compréhensible', async () => {
  const [page, cockpit] = await Promise.all([
    read('src/features/cases/cases-page.tsx'),
    read('src/features/cases/glass-case-cockpit.tsx'),
  ]);
  const fiche = `${page}\n${cockpit}`;
  const types = await read('src/types/index.ts');

  assert.match(fiche, /Suivi Glass Onify/);
  assert.match(fiche, /Statut des travaux/);
  assert.match(fiche, /Part assureur réglée/);
  assert.match(fiche, /caseData\.onify_glass_items/);
  assert.match(types, /onify_glass_case_id: string \| null/);
});

test('une nouvelle Secret key Onify remplace la valeur Vault sans passer par Git', async () => {
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(sync, /vault_update_secret/);
  assert.match(sync, /String\(data \?\? ''\) !== bootstrap/);
  assert.match(sync, /Deno\.env\.get\('ONIFY_API_KEY'\)/);
});
