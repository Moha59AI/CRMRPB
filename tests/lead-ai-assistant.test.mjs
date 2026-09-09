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
  assert.match(edge, /\.from\('appointments'\)/);
  assert.match(edge, /\.from\('windscreen_cases'\)/);
  assert.match(edge, /\.from\('client_document_requests'\)/);
  assert.match(edge, /notes: sourceNotes/);
  assert.match(edge, /store: false/);
  assert.match(edge, /type: 'json_schema'/);
  assert.match(edge, /noteIds\.has/);
  assert.doesNotMatch(edge, /\.select\('[^']*(?:phone|email|vehicle_registration)/);
});

test('la recommandation contient une priorité, un canal et une checklist actionnable', async () => {
  const edge = await read('supabase/functions/lead-ai-assistant/index.ts');
  const component = await read('src/features/ai/lead-ai-assistant.tsx');
  assert.match(edge, /'priority', 'channel'/);
  assert.match(edge, /'objective', 'draft_message', 'checklist'/);
  assert.match(component, /Créer la tâche/);
  assert.match(component, /Copier le message/);
  assert.match(component, /if \(result\.error\) throw new Error/);
});

test('une analyse prioritaire alimente les notifications sans exposer le client', async () => {
  const edge = await read('supabase/functions/lead-ai-assistant/index.ts');
  assert.match(edge, /\.from\('notifications'\)/);
  assert.match(edge, /\.eq\('type', 'ai'\)/);
  assert.match(edge, /Date\.now\(\) - 6 \* 60 \* 60 \* 1000/);
  assert.match(edge, /Une analyse a détecté une action importante à vérifier dans le CRM/);
  assert.doesNotMatch(edge, /body:\s*(?:lead\.|nextAction\.)/);
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
