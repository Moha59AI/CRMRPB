import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261015110000_preserver_details_lead_glass.sql';

test('le passage Lead vers Glass conserve les informations operationnelles', async () => {
  const [migration, sync] = await Promise.all([
    read(MIGRATION),
    read('supabase/functions/onify-sync/index.ts'),
  ]);

  assert.match(migration, /create or replace function public\.completer_dossiers_glass_operationnels/);
  assert.match(migration, /coalesce\(lead\.intervention_address, lead\.address\)/);
  assert.match(migration, /nullif\(trim\(lead\.offer\), ''\)/);
  assert.match(migration, /when lead\.franchise_amount is not null then lead\.franchise_amount/);
  assert.match(migration, /when dossier\.franchise_source = 'manual' then dossier\.franchise_amount/);
  assert.match(sync, /rpc\('completer_dossiers_glass_operationnels'/);

  const completion = sync.indexOf("rpc('completer_dossiers_glass_operationnels'");
  const transition = sync.indexOf("rpc('avancer_leads_apres_dossier_glass'");
  assert.ok(completion > -1 && transition > completion, 'la copie du lead doit preceder son archivage');
});

test('la franchise Onify garde son montant et son unite sans convertir un pourcentage en euros', async () => {
  const [migration, sync] = await Promise.all([
    read(MIGRATION),
    read('supabase/functions/onify-sync/index.ts'),
  ]);

  assert.match(sync, /function onifyFranchise/);
  assert.match(sync, /vehicle\.franchise/);
  assert.match(sync, /vehicle\.franchise_type/);
  assert.match(sync, /vehicleFranchise\?\.type === 'euro'/);
  assert.match(migration, /in \('percent', 'percentage', 'pourcentage', '%'\)/);
  assert.match(migration, /dossier\.franchise_source is distinct from 'manual'/);
  assert.match(migration, /dossier\.franchise_source is distinct from 'lead'/);
});

test('la fiche Glass reste modifiable et synchronise aussi le lead historique', async () => {
  const [migration, page, service] = await Promise.all([
    read(MIGRATION),
    read('src/features/cases/cases-page.tsx'),
    read('src/services/cases-service.ts'),
  ]);

  assert.match(migration, /create or replace function public\.mettre_a_jour_dossier_glass/);
  assert.match(migration, /update public\.leads lead/);
  assert.match(migration, /grant execute on function public\.mettre_a_jour_dossier_glass\(uuid, jsonb\)/);
  assert.match(page, /data-operational-editor/);
  assert.match(page, /Toujours modifiables dans Glass/);
  assert.match(page, /Adresse d’intervention/);
  assert.match(page, /Cadeau \/ offre/);
  assert.match(page, /fetchLeadById/);
  assert.match(service, /rpc\('mettre_a_jour_dossier_glass'/);
});

test('une franchise inconnue reste inconnue et zero reste une vraie valeur', async () => {
  const [migration, page] = await Promise.all([
    read(MIGRATION),
    read('src/features/cases/cases-page.tsx'),
  ]);

  assert.match(migration, /alter column franchise_amount drop default/);
  assert.match(migration, /set franchise_amount = null/);
  assert.match(page, /if \(amount == null\) return 'Non renseignée'/);
  assert.match(page, /return euroFormat\.format\(amount\)/);
});
