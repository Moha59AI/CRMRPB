import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les dépenses fournisseurs sont isolées par espace de travail et par rôle', async () => {
  const migration = await read('supabase/migrations/20261008160000_supplier_expenses.sql');
  assert.match(migration, /create table if not exists public\.supplier_expenses/);
  assert.match(migration, /unique \(workspace_id, supplier, document_number\)/);
  assert.match(migration, /profile\.role in \('admin', 'manager', 'accountant'\)/);
  assert.match(migration, /profile\.role in \('admin', 'accountant'\)/);
});

test('l import conserve les factures, les avoirs et ses contrôles comptables', async () => {
  const migration = await read('supabase/migrations/20261008160000_supplier_expenses.sql');
  assert.match(migration, /source_import = 'vsf-panther-2026-10-08'/);
  assert.match(migration, /v_document_count <> 177/);
  assert.match(migration, /v_item_count <> 1346/);
  assert.match(migration, /v_net_ht <> 68737\.22/);
  assert.match(migration, /v_net_ttc <> 82484\.7/);
  assert.match(migration, /"document_type":"credit_note"/);
});

test('la page fournisseurs expose les totaux et le détail des achats sans promettre les PDF absents', async () => {
  const [page, service, routes, navigation] = await Promise.all([
    read('src/features/finance/supplier-expenses-page.tsx'),
    read('src/features/finance/supplier-expenses-service.ts'),
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
  ]);
  assert.match(service, /from\('supplier_expenses'\)/);
  assert.match(page, /Dépenses fournisseurs/);
  assert.match(page, /Articles et frais/);
  assert.match(page, /les fichiers PDF ne sont pas inclus dans cet import/);
  assert.match(routes, /path="\/finance\/fournisseurs"/);
  assert.match(navigation, /label: 'Fournisseurs'/);
});
