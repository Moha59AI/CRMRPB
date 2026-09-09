import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les analyses IA sont immuables et protégées par quatre politiques RLS', async () => {
  const migration = await read('supabase/migrations/20260909120000_lead_ai_insights.sql');
  assert.match(migration, /create table if not exists public\.lead_ai_insights/);
  assert.match(migration, /alter table public\.lead_ai_insights enable row level security/);
  assert.equal(
    (migration.match(/create policy "(?:select|insert|update|delete)_lead_ai_insights"/g) ?? []).length,
    4,
  );
  assert.match(migration, /create policy "update_lead_ai_insights"[\s\S]*using \(false\)/);
});

test('la clé OpenAI reste dans Vault et son écriture est réservée à l administrateur', async () => {
  const edge = await read('supabase/functions/ai-store-secret/index.ts');
  const front = await read('src/features/ai/lead-ai-service.ts');
  assert.match(edge, /profile\.role !== 'admin'/);
  assert.match(edge, /vault_(?:read|create|update)_secret/);
  assert.match(edge, /openai_api_key_/);
  assert.doesNotMatch(front, /VITE_OPENAI|openai_api_key_/);
});

test('l assistant lit les commentaires sans envoyer les identifiants les plus sensibles', async () => {
  const edge = await read('supabase/functions/lead-ai-assistant/index.ts');
  assert.match(edge, /\.from\('notes'\)/);
  assert.match(edge, /notes: sourceNotes/);
  assert.match(edge, /store: false/);
  assert.match(edge, /type: 'json_schema'/);
  assert.match(edge, /noteIds\.has/);
  assert.doesNotMatch(edge, /\.select\('[^']*(?:phone|email|vehicle_registration)/);
});

test('l interface présente une suggestion et ne déclenche aucun changement de lead', async () => {
  const component = await read('src/features/ai/lead-ai-assistant.tsx');
  const service = await read('src/features/ai/lead-ai-service.ts');
  assert.match(component, /Suggestions uniquement — aucune modification automatique/);
  assert.match(component, /Voir les sources/);
  assert.doesNotMatch(component, /updateLead|\.from\('leads'\)/);
  assert.match(service, /if \(!response\.ok\)/);
  assert.match(service, /throw new Error/);
});
