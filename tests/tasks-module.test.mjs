import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le CRM expose un module Tâches dédié et conserve les anciens liens', async () => {
  const [routes, navigation, page, today] = await Promise.all([
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
    read('src/features/follow-up/follow-up-page.tsx'),
    read('src/features/today/today-page.tsx'),
  ]);

  assert.match(navigation, /label: 'Tâches'[\s\S]*path: '\/tasks'/);
  assert.match(routes, /path="\/tasks"[\s\S]*<FollowUpPage/);
  assert.match(routes, /path="\/follow-up"[\s\S]*Navigate to="\/tasks"/);
  assert.match(page, /title="Tâches"/);
  assert.match(page, /Experts \/ assurances/);
  assert.match(page, /Reprogrammer la tâche/);
  assert.match(page, /navigate\(`\/interventions\/\$\{task\.lead_id\}`\)/);
  assert.match(page, /navigate\('\/emails'\)/);
  assert.match(today, /to="\/tasks"/);
});

test('une tâche peut être programmée directement dans une fiche lead', async () => {
  const [dossier, panel] = await Promise.all([
    read('src/features/dossier/dossier-contenu.tsx'),
    read('src/features/tasks/lead-tasks-panel.tsx'),
  ]);

  assert.match(dossier, /<LeadTasksPanel/);
  assert.match(panel, /Programmer une tâche/);
  assert.match(panel, /createTask\(\{/);
  assert.match(panel, /lead_id: lead\.id/);
  assert.match(panel, /contact_id: lead\.contact_id/);
  assert.match(panel, /type="datetime-local"/);
  assert.match(panel, /Rappeler le client/);
  assert.match(panel, /Relancer les documents/);
  assert.match(panel, /status: 'done'/);
});

test('une demande de pièces expert ou assurance crée une seule tâche traçable', async () => {
  const [ingest, migration, types] = await Promise.all([
    read('supabase/functions/_shared/inbound-email.ts'),
    read('supabase/migrations/20261102110000_email_document_request_tasks.sql'),
    read('src/types/index.ts'),
  ]);

  assert.match(ingest, /export function estDemandePieces/);
  assert.match(ingest, /correspondantPrioritaire && estDemandePieces/);
  assert.match(ingest, /\.from\('tasks'\)\.upsert/);
  assert.match(ingest, /title: `Envoyer les pièces demandées/);
  assert.match(ingest, /priority: 'high'/);
  assert.match(ingest, /source_communication_id: email\.id/);
  assert.match(ingest, /origin: 'email_auto'/);
  assert.match(migration, /source_communication_id uuid/);
  assert.match(migration, /tasks_workspace_source_communication_unique/);
  assert.match(types, /export type TaskOrigin = 'manual' \| 'email_auto' \| 'ai' \| 'import'/);
});
