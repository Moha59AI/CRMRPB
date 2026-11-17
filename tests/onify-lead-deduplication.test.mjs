import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261117100000_empecher_doublons_leads_onify.sql';

test('le passage depuis une fiche marque le lead exact avant ouverture d Onify', async () => {
  const [migration, service, handoff] = await Promise.all([
    read(MIGRATION),
    read('src/services/cases-service.ts'),
    read('src/features/dossier/onify-glass-handoff.tsx'),
  ]);

  assert.match(migration, /add column if not exists onify_handoff_at timestamptz/);
  assert.match(migration, /create or replace function public\.preparer_passage_lead_onify/);
  assert.match(service, /rpc\('preparer_passage_lead_onify'/);
  assert.match(handoff, /prepareOnifyLeadHandoff\(lead\.id\)/);
  assert.match(handoff, /const popup = window\.open\('', '_blank'\)/);
  assert.match(handoff, /onSuccess:[\s\S]*?popup\.location\.replace\(ONIFY_GLASS_URL\)/);
});

test('le dossier Onify ne considère que les leads actifs non encore liés', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /create or replace function public\.trouver_lead_pour_dossier_onify/);
  assert.match(migration, /lead\.onify_case_id is null/);
  assert.match(migration, /autre_dossier\.onify_glass_case_id is not null/);
  assert.match(migration, /lead\.archived_at is null/);
  assert.match(migration, /lead\.status not in \('lost', 'converted'\)/);
  assert.match(migration, /when count\(\*\) = 1/);
  assert.match(migration, /else null/);
});

test('l immatriculation puis la fiche explicitement envoyée priment sur le simple contact', async () => {
  const migration = await read(MIGRATION);
  const plate = migration.indexOf('then 10');
  const handoff = migration.indexOf('then 20');
  const registrationOnly = migration.indexOf('then 30');
  const contactOnly = migration.indexOf('then 40');

  assert.ok(plate > -1 && handoff > plate);
  assert.ok(registrationOnly > handoff && contactOnly > registrationOnly);
  assert.match(migration, /interval '14 days'/);
  assert.match(migration, /interval '180 days'/);
  assert.match(migration, /interval '90 days'/);
  assert.match(migration, /date_dossier \+ interval '2 days'/);
});

test('les doublons d import existants sont archivés sans supprimer une fiche saisie', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /lead_importe\.source = 'import'/);
  assert.match(migration, /lead_importe\.raw_payload->>'source' = 'onify'/);
  assert.match(migration, /duplicate_merged_into_lead_id/);
  assert.match(migration, /set archived_at = coalesce/);
  assert.doesNotMatch(migration, /delete from public\.leads/);
});

test('le trigger rattache le dossier avant que l import puisse créer un autre lead', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /create trigger dossiers_onify_rattacher_lead/);
  assert.match(migration, /before insert or update of[\s\S]*?on public\.windscreen_cases/);
  assert.match(migration, /new\.lead_id := v_lead_id/);
  assert.match(migration, /perform public\.avancer_leads_apres_dossier_glass/);
});
