import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261014100000_affaires_vitrage_centrales.sql';

test('une affaire vitrage relie les quatre modules sans dupliquer le contact', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /create table if not exists public\.affaires_vitrage/);
  assert.match(migration, /contact_id uuid references public\.contacts/);
  for (const table of [
    'leads', 'windscreen_cases', 'appointments', 'quotes', 'invoices',
    'supplier_expenses', 'supplier_expense_allocations',
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?add column if not exists affaire_id`),
    );
  }
  assert.match(migration, /alter table public\.affaires_vitrage enable row level security/);
  assert.match(migration, /create or replace view public\.v_affaires_vitrage/);
});

test('la reprise conserve le lead d origine et ne fabrique aucun faux lead Glass', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /select lead\.id,[\s\S]*?from public\.leads lead/);
  assert.match(migration, /set affaire_id = lead\.affaire_id/);
  assert.match(migration, /Les dossiers Glass historiques sans lead ne fabriquent pas de faux lead/);
  assert.doesNotMatch(migration, /insert into public\.leads/);
  assert.match(migration, /select dossier\.id,[\s\S]*?from public\.windscreen_cases dossier/);
});

test('les rendez vous et la finance recuperent automatiquement la meme affaire', async () => {
  const migration = await read(MIGRATION);
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(migration, /create or replace function public\.resoudre_affaire_vitrage/);
  assert.match(migration, /appointments_preparer_affaire_vitrage/);
  assert.match(migration, /invoices_preparer_affaire_vitrage/);
  assert.match(migration, /supplier_expenses_preparer_affaire_vitrage/);
  assert.match(migration, /supplier_allocations_preparer_affaire_vitrage/);
  assert.match(sync, /rpc\('synchroniser_affaires_vitrage'/);
  assert.match(sync, /resolveFinancialCaseLink/);
  assert.match(sync, /links\.byVehicle\.get\(`\$\{contactId\}:\$\{registration\}`\)/);
  assert.match(sync, /case_id: caseLink\?\.caseId \?\? existingLink\?\.caseId \?\? null/);
  assert.match(sync, /affaire_id: caseLink\?\.affaireId \?\? existingLink\?\.affaireId \?\? null/);
});

test('Glass rend le parcours de l affaire visible et responsive', async () => {
  const page = await read('src/features/cases/cases-page.tsx');
  const client = await read('src/features/client/client-modal.tsx');
  const service = await read('src/services/affaires-service.ts');

  assert.match(page, /function AffaireJourney/);
  assert.match(page, /Une seule affaire, le même contact/);
  assert.match(page, /sm:grid-cols-4/);
  assert.match(client, /function AffairesVitrageClient/);
  assert.match(client, /Une ligne par demande, du lead jusqu’à la finance/);
  assert.match(client, /fetchAffairesByContactId/);
  assert.match(service, /from\('v_affaires_vitrage'\)/);
  assert.match(service, /eq\('glass_case_id', caseId\)/);
  assert.match(service, /eq\('contact_id', contactId\)/);
});
