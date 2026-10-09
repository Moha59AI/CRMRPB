import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/migrations/20261009110000_onify_vehicle_appointments.sql';

test('le véhicule Onify est recopié sans exposer les données financières au technicien', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /onify_payload->'vehicle'/);
  assert.match(migration, /vehicle_make text/);
  assert.match(migration, /vehicle_model text/);
  assert.match(migration, /vehicle_registration text/);
  assert.match(migration, /public\.appointments/);
  assert.doesNotMatch(migration, /amount_(?:ht|ttc)|montant_(?:ht|ttc)/i);
  assert.match(migration, /revoke all .* authenticated/i);
  assert.match(migration, /grant execute .* service_role/i);
});

test('la saisie CRM reste prioritaire et les valeurs Onify peuvent être rafraîchies', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /vehicle_source = 'onify'/);
  assert.match(migration, /coalesce\(nullif\(trim\(l\.vehicle_model\)/);
  assert.match(migration, /Une valeur saisie manuellement reste prioritaire/);
});

test('plusieurs véhicules Onify ne sont jamais attribués au hasard', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /nb_vehicules = 1/);
  assert.match(migration, /regexp_replace\(coalesce\(l\.vehicle_registration/);
  assert.match(migration, /regexp_match\(a\.title/);
  assert.match(migration, /distinct on \(n\.contact_id, n\.cle_vehicule\)/);
});

test('chaque synchronisation Onify propage le véhicule vers le planning', async () => {
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(sync, /rpc\('propager_vehicules_onify'/);
  assert.match(sync, /vehicles: Number\(vehicles \?\? 0\)/);
});

test('le technicien voit le modèle dans la liste et dans le détail du rendez-vous', async () => {
  const service = await read('src/services/interventions-service.ts');
  const card = await read('src/features/interventions/intervention-carte-liste.tsx');
  const planning = await read('src/services/planning-service.ts');
  const calendar = await read('src/features/calendar/calendar-page.tsx');

  assert.match(service, /vehicle_make, vehicle_model, vehicle_registration/);
  assert.match(service, /vehicule: \[marque, modele\]/);
  assert.match(card, /i\.vehicule/);
  assert.match(planning, /vehicule,/);
  assert.match(calendar, /Véhicule à prendre en charge/);
  assert.match(calendar, /client\.vehicule/);
});
