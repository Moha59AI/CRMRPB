import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('chaque etape utilise la couleur personnalisable de son statut', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const colors = await read('src/features/leads/lead-color-settings.ts');
  const debut = page.indexOf('function couleurLigneLead');
  const fin = page.indexOf('// ============ VIEW TOGGLE BUTTON', debut);
  const couleur = page.slice(debut, fin);

  assert.match(couleur, /return 'lead-status-row'/);
  assert.match(colors, /documents_received: '#10b981'/);
  assert.match(colors, /nrp: '#ef4444'/);
  assert.match(colors, /perdu: '#64748b'/);
  assert.match(colors, /status === 'documents_requested'[\s\S]*return 'documents_requested'/);
  assert.match(colors, /status === 'appointment_scheduled'[\s\S]*return 'rdv'/);
});

test('la couleur couvre le tableau et la liste mobile sans masquer la selection', async () => {
  const page = await read('src/features/leads/leads-page.tsx');

  assert.equal(
    (page.match(/couleurLigneLead\(lead\.status,/g) ?? []).length,
    3,
  );
  assert.match(page, /if \(selectionnee\) return 'border-l-4 border-primary/);
  assert.equal((page.match(/leadStatusColorStyle\(lead\.status\)/g) ?? []).length, 4);
});

test('le pipeline reprend toutes les couleurs et distingue les documents recus', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const debut = page.indexOf('function couleurEntetePipeline');
  const fin = page.indexOf('// ============ VIEW TOGGLE BUTTON', debut);
  const couleursPipeline = page.slice(debut, fin);

  assert.match(couleursPipeline, /return 'lead-stage-header'/);
  assert.match(couleursPipeline, /return 'lead-status-card'/);
  assert.match(page, /couleurEntetePipeline\(stage\.key, dragOverColumn === stage\.key\)/);
  assert.match(page, /couleurCartePipeline\(lead\.status, selectionne === true\)/);
  assert.match(page, /leadStageColorStyle\(stage\.key\)/);
});

test('les badges ne confondent plus attente et reception complete des documents', async () => {
  const badge = await read('src/features/leads/status-badge.tsx');
  const colors = await read('src/features/leads/lead-color-settings.ts');
  assert.match(badge, /lead-status-badge/);
  assert.match(badge, /leadStatusColorStyle\(status\)/);
  assert.match(colors, /documents_requested: '#fb923c'/);
  assert.match(colors, /documents_received: '#10b981'/);
  assert.match(colors, /perdu: '#64748b'/);
});

test('les couleurs sont reglables dans Parametres et partagees par espace', async () => {
  const page = await read('src/features/settings/lead-colors-page.tsx');
  const service = await read('src/features/leads/lead-color-settings.ts');
  const migration = await read('supabase/migrations/20261008134000_lead_pipeline_colors.sql');
  const routes = await read('src/app/app-routes.tsx');
  const navigation = await read('src/config/navigation.ts');

  assert.match(page, /type="color"/);
  assert.match(page, /Valeurs par défaut/);
  assert.match(service, /save_lead_pipeline_colors/);
  assert.match(migration, /create table if not exists public\.lead_pipeline_settings/);
  assert.match(migration, /create policy "select_lead_pipeline_settings"/);
  assert.match(routes, /path="couleurs-leads"/);
  assert.match(navigation, /path: '\/settings\/couleurs-leads'/);
});
