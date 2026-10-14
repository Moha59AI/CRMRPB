import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261013143000_lead_to_onify_glass_workflow.sql';

test('le lead s arrete avant Onify et le dossier continue dans Glass', async () => {
  const types = await read('src/types/index.ts');
  const shared = await read('src/features/leads/lead-shared.ts');
  const migration = await read(MIGRATION);

  assert.match(types, /'documents_requested' \| 'documents_received' \| 'appointment_scheduled'/);
  assert.match(shared, /documents_received: 'Prêt Onify'/);
  assert.doesNotMatch(types, /\| 'glass_created'/);
  assert.doesNotMatch(shared, /glass_created:/);
  assert.match(migration, /set status = 'converted'/);
  assert.match(migration, /archived_at = coalesce\(lead\.archived_at, now\(\)\)/);
});

test('un vrai dossier Glass transfere le lead hors du pipeline actif', async () => {
  const migration = await read(MIGRATION);
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(migration, /create or replace function public\.avancer_leads_apres_dossier_glass/);
  assert.match(migration, /dossier\.onify_glass_case_id is not null/);
  assert.match(migration, /lead\.archived_at is null/);
  assert.match(migration, /lead\.status <> 'lost'/);
  assert.match(migration, /set status = 'converted'/);
  assert.match(migration, /insert into public\.notes/);
  assert.match(sync, /rpc\('avancer_leads_apres_dossier_glass'/);
  assert.match(sync, /rpc\('synchroniser_affaires_vitrage'/);
  assert.match(sync, /glassTransitions: glass\.transitions/);
});

test('un nouveau depot de document ne fait pas reculer un dossier deja passe dans Onify', async () => {
  const portal = await read('supabase/functions/client-documents/index.ts');

  assert.match(portal, /\.in\('status', \[/);
  assert.match(portal, /'documents_requested', 'documents_received'/);
  assert.doesNotMatch(
    portal.slice(portal.indexOf("await admin.from('leads').update"), portal.indexOf('if (complete &&', portal.indexOf("await admin.from('leads').update"))),
    /appointment_scheduled|converted/,
  );
});

test('la fiche ouvre Onify puis confirme le dossier par synchronisation', async () => {
  const handoff = await read('src/features/dossier/onify-glass-handoff.tsx');
  const dossier = await read('src/features/dossier/dossier-contenu.tsx');

  assert.match(handoff, /https:\/\/app\.onify\.fr\/glass\/edition/);
  assert.match(handoff, /fetchClientDocumentRequests/);
  assert.match(handoff, /fetchOnifyGlassCaseByLeadId/);
  assert.match(handoff, /syncOnify/);
  assert.match(handoff, /aucun dossier n’est marqué créé avant d’exister réellement dans Onify/);
  assert.match(handoff, /l’affaire a été transférée dans Glass/);
  assert.match(dossier, /<OnifyGlassHandoff lead=\{lead\} \/>/);
});

test('les dossiers ne sont plus crees localement en doublon de Onify', async () => {
  const page = await read('src/features/cases/cases-page.tsx');

  assert.match(page, /Tous les dossiers Glass repris depuis Onify/);
  assert.match(page, /Créer dans Onify/);
  assert.match(page, /fetchGlassCases/);
  assert.doesNotMatch(page, /CreateCaseDialog/);
  assert.doesNotMatch(page, /createCase\(/);
  assert.doesNotMatch(page, /createCaseDocument/);
});
