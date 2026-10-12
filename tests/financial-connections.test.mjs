import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un achat fournisseur ne peut alimenter qu une seule facture après validation', async () => {
  const migration = await read('supabase/migrations/20261008193000_financial_module_connections.sql');
  assert.match(migration, /create table if not exists public\.supplier_expense_allocations/);
  assert.match(migration, /unique \(workspace_id, supplier_expense_id, supplier_item_index\)/);
  assert.match(migration, /match_method in \('manual', 'sku_reviewed'\)/);
  assert.match(migration, /profile\.role in \('admin', 'accountant'\)/);
  assert.match(migration, /create or replace function public\.validate_supplier_expense_allocation/);
  assert.match(migration, /new\.amount_ht := authoritative_amount/);
});

test('les suggestions exigent la même référence vitrage et restent à valider', async () => {
  const [migration, page] = await Promise.all([
    read('supabase/migrations/20261008193000_financial_module_connections.sql'),
    read('src/features/finance/financial-connections-page.tsx'),
  ]);
  assert.match(migration, /supplier_line\.normalized_sku in/);
  assert.match(migration, /candidate_count/);
  assert.match(migration, /security_invoker = on/);
  assert.match(page, /Les références ambiguës ne sont jamais choisies automatiquement/);
  assert.match(page, /Rattacher/);
});

test('la rentabilité consolide facture avoir paiement cadeau et coût fournisseur', async () => {
  const [migration, marketing, marketingPage] = await Promise.all([
    read('supabase/migrations/20261008193000_financial_module_connections.sql'),
    read('src/features/marketing/marketing-service.ts'),
    read('src/features/marketing/marketing-page.tsx'),
  ]);
  assert.match(migration, /create view public\.v_financial_invoice_profitability/);
  assert.match(migration, /actual_gross_margin_ht/);
  assert.match(migration, /supplier_cost_known/);
  assert.match(marketing, /from\('v_financial_invoice_profitability'\)/);
  assert.match(marketing, /margin_known: true/);
  assert.match(marketing, /creditsAlreadyDeductedFromMargin/);
  assert.match(marketingPage, /function marginAfterAdvertising/);
});

test('le rapprochement est accessible depuis Finance et reste limité aux rôles financiers', async () => {
  const [routes, navigation, permissions] = await Promise.all([
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
    read('src/config/permissions.ts'),
  ]);
  assert.match(routes, /path="\/finance\/rapprochement"/);
  assert.match(navigation, /label: 'Rapprochement'/);
  assert.match(permissions, /'\/finance\/rapprochement': \['admin', 'manager', 'accountant'\]/);
});
