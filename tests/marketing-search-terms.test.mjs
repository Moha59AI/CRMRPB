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
