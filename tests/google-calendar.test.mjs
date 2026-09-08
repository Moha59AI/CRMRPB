import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('la carte enferme Leaflet et conserve un programme actionnable a cote', async () => {
  const source = await read('src/features/calendar/carte-interventions.tsx');

  assert.match(source, /relative isolate z-0 min-w-0 flex-1 overflow-hidden/);
  assert.match(source, /<ProgrammeCarte interventions=\{interventions\}/);
  assert.match(source, /Programme de la semaine/);
});

test('OAuth demande uniquement les autorisations Google necessaires', async () => {
  const source = await read('supabase/functions/google-ads-oauth-start/index.ts');

  assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/adwords/);
  assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events/);
  assert.match(source, /include_granted_scopes: 'true'/);
});

test('la synchronisation ne lit que les evenements CRM et limite les donnees envoyees', async () => {
  const source = await read('supabase/functions/google-calendar-sync/index.ts');
  const payloadStart = source.indexOf('function eventPayload');
  const payloadEnd = source.indexOf('async function payloadHash');
  const payload = source.slice(payloadStart, payloadEnd);
  const selectionStart = source.indexOf(".from('appointments')");
  const selectionEnd = source.indexOf(".eq('workspace_id'", selectionStart);
  const selection = source.slice(selectionStart, selectionEnd);

  assert.match(source, /privateExtendedProperty: `crmrpb_workspace_id=\$\{workspaceId\}`/);
  assert.match(payload, /summary: appointment\.title/);
  assert.match(payload, /location: appointment\.address/);
  assert.match(payload, /start: \{ dateTime: appointment\.start_time/);
  assert.match(payload, /end: \{ dateTime: appointment\.end_time/);
  assert.match(payload, /crmrpb_appointment_id: appointment\.id/);
  assert.doesNotMatch(selection, /phone|telephone|description|note|document|insurance|assurance|gift|cadeau/i);
  assert.doesNotMatch(payload, /phone|telephone|description|note|document|insurance|assurance|gift|cadeau/i);
});

test('la migration rend le miroir identifiable et programme la synchro', async () => {
  const [migration, config] = await Promise.all([
    read('supabase/migrations/20260908130000_google_calendar_sync.sql'),
    read('supabase/config.toml'),
  ]);

  assert.match(migration, /google_calendar_event_id text/);
  assert.match(migration, /create unique index if not exists appointments_google_calendar_event_idx/);
  assert.match(migration, /'\*\/5 \* \* \* \*'/);
  assert.match(config, /\[functions\.google-calendar-sync\][\s\S]*verify_jwt = false/);
});

test('enregistrer Google Ads preserve les reglages Agenda deja presents', async () => {
  const source = await read('src/features/integrations/google/google-ads-service.ts');

  assert.match(source, /const previousRaw = \(existing\?\.settings \?\? \{\}\)/);
  assert.match(source, /const storedSettings = \{[\s\S]*\.\.\.previousRaw/);
});
