import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('chaque appareil possede un abonnement push prive et protege par quatre politiques RLS', async () => {
  const migration = await read('supabase/migrations/20260907190000_web_push_notifications.sql');
  assert.match(migration, /create table if not exists public\.push_subscriptions/);
  assert.match(migration, /alter table public\.push_subscriptions enable row level security/);
  assert.equal((migration.match(/create policy "(?:select|insert|update|delete)_push_subscriptions"/g) ?? []).length, 4);
  assert.match(migration, /user_id = auth\.uid\(\)/);
});

test('le secret du trigger est genere dans Vault sans valeur en clair', async () => {
  const migration = await read('supabase/migrations/20260907190000_web_push_notifications.sql');
  assert.match(migration, /gen_random_bytes\(32\)/);
  assert.match(migration, /push_dispatch_secret/);
  assert.match(migration, /x-push-secret/);
  assert.match(migration, /exception[\s\S]*return new;/);
});

test('le navigateur inscrit le PushManager et le worker traite les push application fermee', async () => {
  const alerts = await read('src/lib/alertes.ts');
  const worker = await read('public/sw.js');
  assert.match(alerts, /pushManager\.subscribe/);
  assert.match(alerts, /action: 'register'/);
  assert.match(alerts, /action: 'test'/);
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /registration\.showNotification/);
});

test('le push externe ne contient aucune donnee client', async () => {
  const edge = await read('supabase/functions/web-push/index.ts');
  assert.match(edge, /title: 'Nouvelle notification CRM'/);
  assert.match(edge, /Ouvrez le CRM pour consulter la nouvelle information/);
  assert.doesNotMatch(edge, /notification\.title/);
  assert.doesNotMatch(edge, /notification\.body/);
  assert.doesNotMatch(edge, /\.select\([^)]*(?:first_name|last_name|phone)/);
});

test('une notification de documents est adressee a des utilisateurs reels', async () => {
  const edge = await read('supabase/functions/client-documents/index.ts');
  assert.match(edge, /\.in\('role', \['admin', 'manager', 'advisor'\]\)/);
  assert.match(edge, /user_id: recipient\.id/);
  assert.match(edge, /if \(notificationError\) throw notificationError/);
});
