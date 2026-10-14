import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/migrations/20260930140000_client_quand_il_y_a_facture.sql';
const GLASS_CLIENT_MIGRATION = 'supabase/migrations/20261013160000_clients_et_module_glass.sql';

test('est client qui a une facture, annulee exclue', async () => {
  const sql = await read(MIGRATION);

  assert.match(sql, /est_client/);
  assert.match(sql, /i\.status <> 'cancelled'/);
  assert.match(sql, /\(f\.nb_factures is not null\) as est_client/);
});

test('la reponse passe a tous les roles sans ouvrir les montants', async () => {
  const sql = await read(MIGRATION);

  // `invoices` n'est lisible que par l'administration : une vue en
  // security_invoker annoncerait a un conseiller que personne n'est client.
  assert.match(sql, /create or replace function public\.facturation_par_contact/);
  assert.match(sql, /security definer/);
  assert.match(sql, /i\.workspace_id = public\.get_workspace_id\(\)/);

  // Aucun montant ne sort de la fonction : on regarde son corps, pas la
  // prose qui l'explique.
  const corps = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;'));
  assert.ok(corps.length > 0);
  assert.doesNotMatch(corps, /amount_|montant/i);
});

test('la fiche client ne calcule plus de taux sur un statut jamais saisi', async () => {
  const fiche = await read('src/features/client/client-modal.tsx');

  assert.doesNotMatch(fiche, /Taux de conversion/);
  assert.doesNotMatch(fiche, /nb_converties \/ synthese\.nb_interventions/);
  assert.match(fiche, /label="Client depuis"/);
  assert.match(fiche, /<BadgeClient estClient=\{synthese\.est_client\}/);
});

test('« client fidele » se compte en factures, pas en interventions', async () => {
  const fiche = await read('src/features/client/client-modal.tsx');

  assert.match(fiche, /synthese\.nb_factures > 1 && \(/);
  assert.doesNotMatch(fiche, /synthese\.nb_interventions > 1 && \(\s*<Badge/);
});

test('la liste separe les clients des prospects', async () => {
  const page = await read('src/features/contacts/contacts-page.tsx');
  const service = await read('src/services/contacts-service.ts');

  assert.match(service, /estClient: Boolean\(l\.est_client\)/);
  assert.match(page, /type FiltreClient = 'tous' \| 'clients' \| 'prospects'/);
  assert.match(page, /listeFiltree/);
});

test('un vrai dossier Glass fait passer le prospect dans Clients sans attendre la facture', async () => {
  const sql = await read(GLASS_CLIENT_MIGRATION);
  const page = await read('src/features/contacts/contacts-page.tsx');
  const service = await read('src/services/contacts-service.ts');

  assert.match(sql, /create or replace function public\.dossiers_glass_par_contact/);
  assert.match(sql, /dossier\.onify_glass_case_id is not null/);
  assert.match(sql, /g\.nb_dossiers_glass is not null or f\.nb_factures is not null/);
  assert.match(sql, /onify_payload jsonb/);
  assert.match(page, /useState<FiltreClient>\('clients'\)/);
  assert.match(page, /Client dès la création de son dossier Glass Onify/);
  assert.match(service, /nbDossiersGlass: Number\(l\.nb_dossiers_glass\)/);
});
