import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261006100000_rendez_vous_fait_avancer_lead.sql';

test('un rendez-vous importe est rattache avant de faire avancer le lead', async () => {
  const sync = await read('supabase/functions/google-calendar-sync/index.ts');
  const migration = await read(MIGRATION);

  assert.match(sync, /\.rpc\('rattacher_rendez_vous_clients'/);
  assert.match(migration, /after insert or update of lead_id, status, start_time, end_time/);
  assert.match(migration, /set status = 'appointment_scheduled'/);
  assert.match(migration, /next_action_at = null/);
});

test('la regle protege les rendez-vous et dossiers qui ne doivent pas bouger', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /new\.status not in \('scheduled', 'confirmed'\)/);
  assert.match(migration, /new\.end_time <= now\(\)/);
  assert.match(migration, /l\.archived_at is null/);
  assert.match(migration, /l\.status not in \('appointment_scheduled', 'converted'\)/);
});

test('chaque changement automatique reste visible dans l historique', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /insert into public\.notes/);
  assert.match(migration, /Passage automatique à RDV pris/);
  assert.match(migration, /synchronisé avec l''agenda/);
});

test('les rendez-vous futurs deja presents sont rattrapes sans doublonner les leads', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /select distinct on \(a\.lead_id\)/);
  assert.match(migration, /a\.status in \('scheduled', 'confirmed'\)/);
  assert.match(migration, /a\.end_time > now\(\)/);
  assert.match(migration, /order by a\.lead_id, a\.start_time/);
});

