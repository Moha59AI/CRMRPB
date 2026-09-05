import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la table des termes de recherche est cloisonnee par workspace', async () => {
  const migration = await read('supabase/migrations/20260904090000_google_ads_search_terms.sql');
  assert.match(migration, /create table if not exists public\.google_ads_search_terms_daily/);
  assert.match(migration, /enable row level security/);
  assert.equal((migration.match(/create policy "[^"]+"/g) ?? []).length, 4);
  assert.match(migration, /public\.get_workspace_id\(\)/);
});

test('la synchronisation demande requete mot-cle appareil et rentabilite a Google', async () => {
  const sync = await read('supabase/functions/google-ads-sync/index.ts');
  assert.match(sync, /FROM search_term_view/);
  assert.match(sync, /search_term_view\.search_term/);
  assert.match(sync, /segments\.keyword\.info\.text/);
  assert.match(sync, /segments\.device/);
  assert.match(sync, /metrics\.cost_micros/);
  assert.match(sync, /google_ads_search_terms_daily/);
  assert.doesNotMatch(sync, /segments\.search_term_targeting_status/);
  assert.match(sync, /searchTermsByKey/);
});

test('la page separe les termes saisis des mots-cles declencheurs', async () => {
  const page = await read('src/features/marketing/marketing-page.tsx');
  assert.match(page, /Requêtes saisies \(/);
  assert.match(page, /Mots-clés déclencheurs \(/);
  assert.match(page, /Exporter la vue/);
  assert.match(page, /useState<AnalysisView>\('attention'\)/);
});

test('l historique Onify est dedoublonne et distingue les dossiers Glass', async () => {
  const migration = await read('supabase/migrations/20260904170000_import_onify_google_history.sql');
  const service = await read('src/features/marketing/marketing-service.ts');
  const page = await read('src/features/marketing/marketing-page.tsx');

  assert.match(migration, /leads_onify_lead_id_unique/);
  assert.equal((migration.match(/^\s*\('\d{4}',/gm) ?? []).length, 19);
  assert.equal((migration.match(/'\d{4}', '[A-Z0-9-]+ ·/g) ?? []).length, 6);
  assert.match(migration, /when glass_dossier_id is not null then 'converted'/);
  assert.match(service, /transformedLeads/);
  assert.match(page, /Dossiers Glass/);
});

test('les leads Onify attribues a Google ont une source Google Ads visible', async () => {
  const migration = await read('supabase/migrations/20260905090000_google_ads_lead_source.sql');
  const types = await read('src/types/index.ts');
  const shared = await read('src/features/leads/lead-shared.ts');

  assert.match(migration, /source in \('meta', 'google_ads', 'webhook', 'manual', 'import'\)/);
  assert.match(migration, /set source = 'google_ads'/);
  assert.match(types, /LeadSource = 'meta' \| 'google_ads'/);
  assert.match(shared, /google_ads: 'Google Ads'/);
});
