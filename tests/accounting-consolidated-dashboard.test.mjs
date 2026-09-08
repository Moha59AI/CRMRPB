import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/features/finance/financial-dashboard-page.tsx', 'utf8');
const section = readFileSync('src/features/finance/accounting-consolidated-section.tsx', 'utf8');
const snapshot = readFileSync('src/features/finance/accounting-consolidated-snapshot.ts', 'utf8');

test('la consolidation comptable complete le dashboard natif sans le remplacer', () => {
  assert.match(page, /<DashboardContent view=\{view\} \/>/);
  assert.match(page, /<AccountingConsolidatedSection \/>/);
  assert.ok(page.indexOf('<DashboardContent') < page.indexOf('<AccountingConsolidatedSection'));
  assert.match(section, /Snapshot externe provisoire/);
  assert.match(section, /données natives et synchronisées/);
});

test('le perimetre et les reserves comptables restent explicites', () => {
  assert.match(section, /Wambrechies exclu/);
  assert.match(section, /variation de trésorerie, jamais un bénéfice/);
  assert.match(section, /rentabilité nette reste indéterminable/);
  assert.match(snapshot, /wambrechiesExcluded: true/);
});

test('les sept paiements TIIME a comptabiliser sont tous centralises', () => {
  const invoiceNumbers = ['F20260093', 'F20260086', 'F20260085', 'F20260081', 'F20260079', 'F20260068', 'F20260053'];
  for (const invoice of invoiceNumbers) assert.match(snapshot, new RegExp(invoice));
  assert.match(snapshot, /livePaymentsNotPostedCount: 7/);
  assert.match(snapshot, /livePaymentsNotPostedTotal: 6612\.68/);
});

test('tous les tableaux de controle demandes sont disponibles', () => {
  for (const marker of [
    'Répartition ONIFY / RéseauGlass',
    '7 paiements TIIME à comptabiliser',
    'Rapprochement offres / avoirs',
    'Flux mensuels',
    'Principales sorties',
    'Principaux assureurs',
    'Anomalies de qualité',
    'Plan d’actions recommandé',
  ]) assert.ok(section.includes(marker), `${marker} doit rester visible`);
});

test('les liens sources ne sont visibles que dans la version locale', () => {
  assert.match(section, /import\.meta\.env\.DEV/);
  assert.match(section, /Sources de contrôle — visibles uniquement en local/);
});
