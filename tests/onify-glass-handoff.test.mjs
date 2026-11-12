import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261110100000_unifier_leads_onify.sql';

test('le lead reste le dossier de travail et gagne les etapes Onify', async () => {
  const types = await read('src/types/index.ts');
  const shared = await read('src/features/leads/lead-shared.ts');
  const migration = await read(MIGRATION);

  assert.match(types, /'documents_received' \| 'onify_processing'/);
  assert.match(types, /'intervention_done' \| 'payment_pending'/);
  assert.match(shared, /documents_received: 'Prêt Onify'/);
  assert.match(shared, /onify_processing: 'Suivi Onify'/);
  assert.match(shared, /payment_pending: 'Facturation'/);
  assert.match(migration, /add column if not exists onify_case_id uuid/);
  assert.match(migration, /when lead\.status = 'converted' and lead\.onify_case_id is null[\s\S]*?then null/);
  assert.match(migration, /else lead\.archived_at/);
  assert.doesNotMatch(migration, /archived_at = coalesce\(lead\.archived_at, now\(\)\)/);
});

test('un vrai dossier Onify enrichit le lead sans le sortir du pipeline', async () => {
  const migration = await read(MIGRATION);
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(migration, /create or replace function public\.avancer_leads_apres_dossier_glass/);
  assert.match(migration, /dossier\.onify_glass_case_id is not null/);
  assert.match(migration, /insurance = coalesce/);
  assert.match(migration, /franchise_amount = coalesce/);
  assert.match(migration, /intervention_address = coalesce/);
  assert.match(migration, /offer = coalesce/);
  assert.match(migration, /status = public\.statut_lead_depuis_onify/);
  assert.match(sync, /rpc\('avancer_leads_apres_dossier_glass'/);
  assert.match(sync, /rpc\('synchroniser_affaires_vitrage'/);
  assert.match(sync, /glassTransitions: Math\.max\(glass\.transitions, numeric\(financialLeadEnrichment\)\)/);
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

test('la fiche ouvre Onify puis affiche l enrichissement sur le meme lead', async () => {
  const handoff = await read('src/features/dossier/onify-glass-handoff.tsx');
  const dossier = await read('src/features/dossier/dossier-contenu.tsx');

  assert.match(handoff, /export function OnifyLeadEnrichment/);
  assert.match(handoff, /https:\/\/app\.onify\.fr\/glass\/edition/);
  assert.match(handoff, /fetchClientDocumentRequests/);
  assert.match(handoff, /fetchOnifyGlassCaseByLeadId/);
  assert.match(handoff, /syncOnify/);
  assert.match(handoff, /la fiche Lead a été enrichie/);
  assert.match(handoff, /Le dossier Onify et le lead restent une seule fiche/);
  assert.doesNotMatch(handoff, /navigate\('\/glass'/);
  assert.match(dossier, /<OnifyLeadEnrichment lead=\{lead\} \/>/);
});

test('les dossiers historiques Onify obtiennent un lead importe sans doublon', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /insert into public\.leads \(/);
  assert.match(migration, /and dossier\.lead_id is null/);
  assert.match(migration, /on conflict \(workspace_id, onify_case_id\)/);
  assert.match(migration, /update public\.windscreen_cases dossier[\s\S]*?set lead_id = lead\.id/);
  assert.match(migration, /lead\.onify_case_id = dossier\.id/);
});
