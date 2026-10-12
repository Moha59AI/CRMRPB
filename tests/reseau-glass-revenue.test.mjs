import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la migration importe exactement les 238 factures Reseau Glass controlees', async () => {
  const migration = await read('supabase/migrations/20261012130000_reseau_glass_revenue.sql');
  const rows = [...migration.matchAll(/\('([^']+)', date '([0-9-]+)', ([0-9.]+), ([0-9.]+)\)/g)];
  const refs = new Set(rows.map((row) => row[1]));
  const totalHt = rows.reduce((sum, row) => sum + Number(row[3]), 0);
  const totalTtc = rows.reduce((sum, row) => sum + Number(row[4]), 0);

  assert.equal(rows.length, 238);
  assert.equal(refs.size, 238);
  assert.equal(Number(totalHt.toFixed(2)), 218829.68);
  assert.equal(Number(totalTtc.toFixed(2)), 262639.51);
  assert.match(migration, /source_system = 'reseau_glass'/);
  assert.match(migration, /payment_data_complete,[\s\S]*credit_data_complete/);
  assert.match(migration, /false,\s*false,\s*now\(\)/);
  assert.match(migration, /on conflict \(workspace_id, invoice_number\) do update/);
});

test('les sources externes sont dedoublonnees et Onify reste complet', async () => {
  const migration = await read('supabase/migrations/20261012130000_reseau_glass_revenue.sql');
  const onify = await read('supabase/functions/onify-sync/index.ts');

  assert.match(migration, /invoices_external_source_unique/);
  assert.match(migration, /where external_invoice_id is not null/);
  assert.match(migration, /where onify_invoice_id is not null/);
  assert.match(onify, /source_system: 'onify'/);
  assert.match(onify, /external_invoice_id: String\(invoice\.invoice_id\)/);
  assert.match(onify, /payment_data_complete: true/);
  assert.match(onify, /credit_data_complete: true/);
});

test('Finance compte Reseau Glass dans le CA sans creer de faux impayes', async () => {
  const page = await read('src/features/finance/financial-dashboard-page.tsx');

  assert.match(page, /const AUTO_REFRESH_MS = 30_000/);
  assert.match(page, /refetchInterval: AUTO_REFRESH_MS/);
  assert.match(page, /refetchOnWindowFocus: true/);
  assert.match(page, /refetchOnMount: 'always'/);
  assert.match(page, /label="CA facturé" value=\{euro\.format\(totals\.billed\)\}/);
  assert.match(page, /function hasCompletePaymentData/);
  assert.match(page, /if \(!hasCompletePaymentData\(invoice\)\) return 0/);
  assert.match(page, /paymentTrackedBilled/);
  assert.match(page, /Réseau Glass inclus dans le chiffre d’affaires/);
  assert.match(page, /buildInvoiceSources/);
  assert.match(page, /reseau_glass: 'Réseau Glass'/);
  assert.match(page, /Factures aux avoirs non rapprochés/);
});

test('Facturation charge le registre complet et affiche la source et le rapprochement', async () => {
  const service = await read('src/services/billing-service.ts');
  const page = await read('src/features/billing/billing-page.tsx');
  const pdf = await read('src/features/billing/bouton-pdf-facture.tsx');

  assert.match(service, /query\.limit\(5000\)/);
  assert.match(page, /label: 'Réseau Glass'/);
  assert.match(page, />Source<\/TableHead>/);
  assert.match(page, /inv\.payment_data_complete === false/);
  assert.match(page, /À rapprocher/);
  assert.match(pdf, /facture\.source_system === 'reseau_glass'/);
});
