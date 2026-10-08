import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/features/finance/financial-dashboard-page.tsx', 'utf8');
const service = readFileSync('src/features/finance/financial-dashboard-service.ts', 'utf8');
const routes = readFileSync('src/app/app-routes.tsx', 'utf8');
const navigation = readFileSync('src/config/navigation.ts', 'utf8');

test('le dashboard financier consolide toutes les sources deja disponibles', () => {
  for (const table of ['invoices', 'payments', 'quotes', 'onify_credit_notes', 'gifts', 'contacts', 'windscreen_cases', 'insurers', 'supplier_expenses']) {
    assert.ok(service.includes(`from('${table}')`), `${table} doit alimenter le dashboard`);
  }
  assert.match(service, /if \(failed\?\.error\) throw new Error/);
});

test('les avoirs brouillons ne diminuent pas le chiffre d affaires', () => {
  assert.match(page, /includes\('brouillon'\)/);
  assert.match(page, /netRevenue: billed - creditAmount/);
});

test('une facture payee ne redevient pas un impaye a cause d un reliquat Onify', () => {
  const paidGuard = page.indexOf("invoice.status === 'paid'");
  const storedBalance = page.indexOf('const stored = numeric(invoice.remaining_amount)', paidGuard);
  assert.ok(paidGuard >= 0 && storedBalance > paidGuard);
});

test('le dashboard distingue encaissements marge et anciennete des impayes', () => {
  for (const marker of ['Encaissé', 'Marge brute HT', 'Achats fournisseurs', 'Retard 1 à 30 jours', 'Retard 31 à 60 jours', 'plus de 60 jours']) {
    assert.ok(page.includes(marker), `${marker} doit etre visible`);
  }
  assert.match(page, /Factures à relancer en priorité/);
  assert.match(page, /invoicesWithDetailedPayments/);
});

test('la marge brute retranche les avoirs HT et les achats fournisseurs HT', () => {
  assert.match(page, /const netRevenueHt = amountHt - creditAmountHt/);
  assert.match(page, /margin: netRevenueHt - supplierPurchasesHt/);
  assert.match(page, /creditAmountExcludingTax/);
  assert.match(page, /Ce montant n’est pas le bénéfice net/);
});

test('la page Finance est routee et visible dans la navigation', () => {
  assert.match(routes, /path="\/finance"/);
  assert.match(navigation, /label: 'Finance'/);
});
