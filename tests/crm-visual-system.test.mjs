import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les modules de navigation héritent du cockpit commun', async () => {
  const pages = [
    'src/features/leads/leads-page.tsx',
    'src/features/cases/cases-page.tsx',
    'src/features/contacts/contacts-page.tsx',
    'src/features/calendar/calendar-page.tsx',
    'src/features/marketing/marketing-page.tsx',
    'src/features/campaigns/campaigns-page.tsx',
    'src/features/communications/communications-page.tsx',
    'src/features/workflows/workflows-page.tsx',
    'src/features/billing/billing-page.tsx',
    'src/features/finance/financial-dashboard-page.tsx',
    'src/features/finance/supplier-expenses-page.tsx',
    'src/features/finance/financial-connections-page.tsx',
    'src/features/supplier-redaction/supplier-redaction-page.tsx',
    'src/features/interventions/interventions-page.tsx',
    'src/features/relances/relances-page.tsx',
    'src/features/integrations/email/email-inbox-page.tsx',
    'src/features/settings/settings-page.tsx',
  ];

  for (const page of pages) {
    const source = await read(page);
    assert.match(source, /<PageHeader\b/, `${page} doit utiliser l'en-tête partagé`);
  }

  const entete = await read('src/components/PageHeader.tsx');
  assert.match(entete, /<ModuleHero/);
  assert.match(entete, /navSections/);
  assert.match(entete, /settingsNavSections/);
});

test("l'accueil et l'atelier utilisent le même langage sans perdre leurs actions", async () => {
  const [accueil, atelier] = await Promise.all([
    read('src/features/today/today-page.tsx'),
    read('src/features/atelier/atelier-page.tsx'),
  ]);

  assert.match(accueil, /<ModuleHero/);
  assert.match(accueil, /Quotidien · Vue d’ensemble/);
  assert.match(atelier, /<ModuleHero/);
  assert.match(atelier, /Quotidien · Atelier/);
  assert.match(atelier, /onNouveauDossier/);
  assert.match(atelier, /onActualiser/);
});

test('le cockpit reste responsive et enveloppe toutes les routes', async () => {
  const [hero, layout, css] = await Promise.all([
    read('src/components/ModuleHero.tsx'),
    read('src/layouts/app-layout.tsx'),
    read('src/index.css'),
  ]);

  assert.match(hero, /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(hero, /crm-module-actions/);
  assert.match(hero, /data-module-hero/);
  assert.match(layout, /data-crm-module-shell/);
  assert.match(layout, /crm-sidebar/);
  assert.match(css, /\[data-crm-module-shell\]/);
  assert.match(css, /\.crm-module-hero::after/);
  assert.match(css, /@media \(max-width: 639px\)/);
});
