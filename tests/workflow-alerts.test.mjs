import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les six alertes metier sont installees et controlees toutes les 15 minutes', async () => {
  const migration = await read('supabase/migrations/20260909150000_workflow_alerts.sql');

  for (const systemKey of [
    'lead_first_contact',
    'task_overdue',
    'documents_unopened',
    'appointment_confirmation',
    'invoice_overdue',
    'gift_pending',
  ]) {
    assert.match(migration, new RegExp(`system_key[^\\n]+${systemKey}`));
  }

  assert.match(migration, /create or replace function public\.executer_workflows_alertes/);
  assert.match(migration, /'workflow-alerts',[\s\S]*'\*\/15 \* \* \* \*'/);
  assert.match(migration, /grant execute on function public\.executer_workflows_alertes\(uuid, boolean\) to authenticated/);
});

test('le moteur cible les bons roles, dedoublonne et ne modifie pas les fiches metier', async () => {
  const migration = await read('supabase/migrations/20260909150000_workflow_alerts.sql');

  assert.match(migration, /notifications_workflow_dedup_unique/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(migration, /array\['admin', 'manager', 'advisor'\]/);
  assert.match(migration, /array\['admin', 'manager', 'accountant'\]/);
  assert.doesNotMatch(migration, /update public\.(leads|tasks|appointments|invoices|gifts|client_document_requests)/i);
});

test('le service remonte les erreurs et expose installation et controle manuel', async () => {
  const service = await read('src/services/automation-service.ts');

  assert.match(service, /export async function installWorkflowAlerts/);
  assert.match(service, /rpc\('installer_workflows_alertes'\)/);
  assert.match(service, /export async function runWorkflowAlertsNow/);
  assert.match(service, /rpc\('executer_workflows_alertes'/);
  assert.match(service, /if \(error\) throw new Error\(error\.message\)/);
  assert.doesNotMatch(service, /return \{ error: error\.message, workflow: null \}/);
});

test('la page distingue les alertes gerees et respecte les droits de modification', async () => {
  const page = await read('src/features/workflows/workflows-page.tsx');

  assert.match(page, /Alertes opérationnelles/);
  assert.match(page, /Contrôler maintenant/);
  assert.match(page, /Installer les alertes/);
  assert.match(page, /profile\?\.role === 'admin' \|\| profile\?\.role === 'manager'/);
  assert.match(page, /disabled=\{!canManage\}/);
  assert.match(page, /canDelete &&/);
});
