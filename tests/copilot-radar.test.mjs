import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le radar est disponible depuis toutes les pages protégées sans appel OpenAI', async () => {
  const layout = await read('src/layouts/app-layout.tsx');
  const radar = await read('src/features/ai/copilot-radar.tsx');
  const service = await read('src/features/ai/copilot-radar-service.ts');
  assert.match(layout, /<CopilotRadar \/>/);
  assert.match(radar, /Radar copilote/);
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
