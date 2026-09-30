import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/migrations/20260930120000_identite_client_discriminante.sql';

test('un identifiant partage ne designe personne, sauf si le nom tranche', async () => {
  const sql = await read(MIGRATION);

  // Le coeur de la regle : on compte avant de choisir.
  assert.match(sql, /select count\(\*\), \(array_agg\(id\)\)\[1\] into v_n, v_id/);
  assert.match(sql, /if v_n > 1 and p_cle_nom is not null/);
  assert.match(sql, /if v_n = 1 then return v_id; end if;/);
  // `min(uuid)` n'existe pas en Postgres : la fonction tombait a l'execution.
  assert.doesNotMatch(sql, /min\(id\)/);
});

test('une identite ambigue cree une fiche plutot que d en choisir une', async () => {
  const sql = await read(MIGRATION);

  assert.match(sql, /v_id uuid := public\.contact_designe\(/);
  assert.match(sql, /insert into public\.contacts/);
  assert.doesNotMatch(sql, /limit 1;/);
});

test("l'adresse est comparable avant d'etre comparee", async () => {
  const sql = await read(MIGRATION);
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(sql, /mailto:/);
  assert.match(sync, /\^\\s\*mailto:\\s\*/i);
});

test('la synchro Onify n indexe que les identifiants discriminants', async () => {
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(sync, /function indexDiscriminant/);
  assert.match(sync, /occurrences\.get\(valeur\) === 1/);
  assert.match(sync, /const byPhone = indexDiscriminant\(/);
  assert.match(sync, /const byEmail = indexDiscriminant\(/);
});

test('la vue de rapprochement respecte les droits de lecture', async () => {
  const sql = await read(MIGRATION);

  assert.match(sql, /create or replace view public\.v_clients_a_rapprocher/);
  assert.match(sql, /security_invoker = on/);
});
