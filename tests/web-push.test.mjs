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

test('le push nouveau lead autorise seulement la source et un code postal valide', async () => {
  const edge = await read('supabase/functions/web-push/index.ts');
  const migration = await read('supabase/migrations/20260910110000_new_lead_push_postal_code.sql');

  assert.match(migration, /add column if not exists push_title text/);
  assert.match(migration, /add column if not exists push_body text/);
  assert.match(migration, /regexp_replace\(coalesce\(new\.postal_code, ''\), '\[\^0-9\]'/);
  assert.match(migration, /length\(v_code_postal\) <> 5/);
  assert.match(migration, /'Code postal ' \|\| coalesce\(v_code_postal, 'non renseigné'\)/);
  assert.match(migration, /if new\.source = 'manual' then/);
  assert.match(migration, /'\/interventions\/' \|\| new\.id/);

  assert.match(edge, /\.select\('id, user_id, type, link, workflow_id, push_title, push_body'\)/);
  assert.match(edge, /notification\.type !== 'lead'/);
  assert.match(edge, /safeLeadPushTitles\.has\(title\)/);
  assert.match(edge, /\^Code postal \(\?:\[0-9\]\{5\}\|non renseigné\)\$/);
  assert.match(edge, /title: safePush\?\.title \?\? 'Nouvelle notification CRM'/);
  assert.match(edge, /body: safePush\?\.body \?\? 'Ouvrez le CRM pour consulter la nouvelle information\.'/);
});

test('les notifications mobiles annoncent clairement leur nature sans exposer le dossier', async () => {
  const edge = await read('supabase/functions/web-push/index.ts');

  for (const label of [
    'Documents client reçus',
    'Nouvel email reçu',
    'Copilote : action prioritaire',
    'Lead à rappeler',
    'Relance en retard',
    'Documents à relancer',
    'Rendez-vous à confirmer',
    'Facture en retard',
    'Cadeau ou virement en attente',
  ]) {
    assert.match(edge, new RegExp(label));
  }

  assert.match(edge, /safePushByType/);
  assert.match(edge, /safeWorkflowPushByKey/);
  assert.match(edge, /\.select\('flow_data'\)/);
  assert.match(edge, /safePushContent\(notification\)/);
});

test('le push externe ne lit jamais le nom, le telephone ou le contenu detaille', async () => {
  const edge = await read('supabase/functions/web-push/index.ts');
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
