import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le radar est disponible depuis toutes les pages protégées sans appel OpenAI', async () => {
  const layout = await read('src/layouts/app-layout.tsx');
  const radar = await read('src/features/ai/copilot-radar.tsx');
  const service = await read('src/features/ai/copilot-radar-service.ts');
  assert.match(layout, /<CopilotRadar \/>/);
  assert.match(radar, /Centre d’action/);
  assert.match(radar, /refetchInterval: 180_000/);
  assert.doesNotMatch(service, /api\.openai\.com|lead-ai-assistant/);
});

test('le radar couvre les domaines prioritaires et ouvre les vraies fiches', async () => {
  const service = await read('src/features/ai/copilot-radar-service.ts');
  assert.match(service, /'commercial' \| 'documents' \| 'agenda' \| 'finance' \| 'assistant'/);
  assert.match(service, /\.from\('leads'\)/);
  assert.match(service, /\.from\('tasks'\)/);
  assert.match(service, /\.from\('appointments'\)/);
  assert.match(service, /\.from\('client_document_requests'\)/);
  assert.match(service, /\.from\('invoices'\)/);
  assert.match(service, /\/interventions\/\$\{leadId\}/);
});

test('les alertes restent des recommandations et ne modifient aucune donnée métier', async () => {
  const service = await read('src/features/ai/copilot-radar-service.ts');
  assert.doesNotMatch(service, /\.update\(|\.insert\(|\.delete\(/);
});

test('le centre d action isole trois priorites et propose des decisions explicites', async () => {
  const radar = await read('src/features/ai/copilot-radar.tsx');

  assert.match(radar, /filteredAlerts\.slice\(0, 3\)/);
  assert.match(radar, /À faire maintenant/);
  assert.match(radar, /Pourquoi maintenant/);
  assert.match(radar, /Reporter 4 h/);
  assert.match(radar, /Traité/);
  assert.match(radar, /Masquer 30 jours/);
  assert.match(radar, /ne modifie jamais le dossier/);
});

test('les decisions du copilote sont personnelles synchronisees et protegees par RLS', async () => {
  const stateService = await read('src/features/ai/copilot-state-service.ts');
  const migration = await read('supabase/migrations/20260928193000_copilot_alert_states.sql');

  assert.match(stateService, /\.from\('copilot_alert_states'\)/);
  assert.match(stateService, /\.upsert\(/);
  assert.match(stateService, /onConflict: 'workspace_id,user_id,alert_key'/);
  assert.match(migration, /enable row level security/);
  for (const action of ['select', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`create policy "${action}_copilot_alert_states"`));
  }
  assert.match(migration, /user_id = auth\.uid\(\)/);
});
