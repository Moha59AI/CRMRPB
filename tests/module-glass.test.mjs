import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Glass est un module visible et garde la compatibilite des anciens liens', async () => {
  const [navigation, routes, permissions] = await Promise.all([
    read('src/config/navigation.ts'),
    read('src/app/app-routes.tsx'),
    read('src/config/permissions.ts'),
  ]);

  assert.match(navigation, /label: 'Glass'/);
  assert.match(navigation, /path: '\/glass'/);
  assert.match(routes, /path="\/glass"/);
  assert.match(routes, /path="\/cases" element=\{<AncienLienDossierGlass \/>\}/);
  assert.match(routes, /`\/glass\$\{search\}`/);
  assert.match(permissions, /'\/glass': \['admin', 'manager', 'advisor', 'accountant'\]/);
});

test('le module charge tous les vrais dossiers Onify sans plafond de 200', async () => {
  const [page, service, sync] = await Promise.all([
    read('src/features/cases/cases-page.tsx'),
    read('src/services/cases-service.ts'),
    read('supabase/functions/onify-sync/index.ts'),
  ]);

  assert.match(page, /export function GlassPage/);
  assert.match(page, /fetchGlassCases/);
  assert.match(page, /Synchroniser Onify/);
  assert.match(service, /not\('onify_glass_case_id', 'is', null\)/);
  assert.match(service, /while \(true\)/);
  assert.doesNotMatch(service, /const limit = 20_000/);
  assert.match(service, /onify_vehicle_registration\.ilike/);
  assert.match(sync, /const GLASS_SYNC_VERSION = 2/);
  assert.match(sync, /!glassFullRescan && glassLastSync/);
  assert.match(sync, /glass_sync_version: GLASS_SYNC_VERSION/);
});

test('les statuts Glass restent pilotes par Onify et la synchro manuelle reste admin', async () => {
  const page = await read('src/features/cases/cases-page.tsx');

  assert.match(page, /profile\?\.role === 'admin'/);
  assert.match(page, /Synchronisé depuis Onify/);
  assert.doesNotMatch(page, /statusMutation/);
  assert.doesNotMatch(page, /updateCase\(id, \{ status \}\)/);
});

test('la fiche client conserve et expose la copie Onify', async () => {
  const [sync, migration, fiche] = await Promise.all([
    read('supabase/functions/onify-sync/index.ts'),
    read('supabase/migrations/20261013160000_clients_et_module_glass.sql'),
    read('src/features/client/client-modal.tsx'),
  ]);

  assert.match(sync, /onify_payload: customer/);
  assert.match(sync, /onify_phones: phones/);
  assert.match(sync, /const CONTACT_SYNC_VERSION = 2/);
  assert.match(migration, /onify_customer_added_at timestamptz/);
  assert.match(fiche, /Fiche Onify synchronisée/);
  assert.match(fiche, /Ces informations viennent d’Onify/);
});
