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
  assert.match(page, /synchronis[ée]s? depuis Onify/i);
  assert.doesNotMatch(page, /statusMutation/);
  assert.doesNotMatch(page, /updateCase\(id, \{ status \}\)/);
});

test('Glass est un cockpit operationnel avant la liste detaillee', async () => {
  const page = await read('src/features/cases/cases-page.tsx');

  assert.match(page, /Glass · dossiers/);
  assert.match(page, /À traiter en priorité/);
  assert.match(page, /Prochains rendez-vous/);
  assert.match(page, /Mes dossiers Glass/);
  assert.match(page, /glassProcessDefinitions/);
  assert.match(page, /À déclarer/);
  assert.match(page, /À signer/);
  assert.match(page, /LRE à envoyer/);
  assert.match(page, /En relance/);
  assert.match(page, /Payés/);
  assert.match(page, /setProcessFilter/);
  assert.match(page, /Vue cartes/);
  assert.match(page, /Vue liste/);
  assert.match(page, /Filtres avancés/);
  assert.match(page, /fetchAppointments\(\{ startDate: dashboardRange\.start, endDate: dashboardRange\.end \}\)/);
  assert.match(page, /clientNameForCase\(caseData, contactMap, leadMap\)/);
  assert.match(page, /Assurance \/ intervention/);
  assert.match(page, /Montants \/ règlement/);
  assert.match(page, /GlassProgressTrack/);
});

test('les dossiers Glass sont tries par date d arrivee du plus recent au plus ancien par defaut', async () => {
  const page = await read('src/features/cases/cases-page.tsx');

  assert.match(page, /type GlassSortOrder = 'arrival_desc' \| 'arrival_asc' \| 'updated_desc'/);
  assert.match(page, /useState<GlassSortOrder>\('arrival_desc'\)/);
  assert.match(page, /caseData\.onify_created_at \?\? caseData\.created_at/);
  assert.match(page, /compareGlassCases\(a, b, sortOrder\)/);
  assert.match(page, /Arrivée : plus récents/);
  assert.match(page, /Arrivée : plus anciens/);
  assert.match(page, /Dernière mise à jour/);
});

test('la fiche Glass reprend la hierarchie de traitement Onify sans modifier les donnees Onify', async () => {
  const page = await read('src/features/cases/cases-page.tsx');

  assert.match(page, /Préparer le dossier/);
  assert.match(page, /Transmettre/);
  assert.match(page, /Clôturer le dossier/);
  assert.match(page, /Client & véhicule/);
  assert.match(page, /Sinistre & assurance/);
  assert.match(page, /Documents & règlement/);
  assert.match(page, /Ouvrir le dossier Onify/);
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

test('la fiche Glass affiche une vue 3D exacte issue d un catalogue trace', async () => {
  const [page, viewer, service, edgeFunction, migration, config] = await Promise.all([
    read('src/features/cases/cases-page.tsx'),
    read('src/features/cases/vehicle-3d-viewer.tsx'),
    read('src/services/vehicle-3d-service.ts'),
    read('supabase/functions/vehicle-3d-match/index.ts'),
    read('supabase/migrations/20261014123000_vehicle_3d_catalog.sql'),
    read('supabase/config.toml'),
  ]);

  assert.match(page, /<Vehicle3DViewer/);
  assert.match(page, /onify_vehicle_make/);
  assert.match(page, /onify_vehicle_model/);
  assert.match(viewer, /Vue 3D du véhicule/);
  assert.match(viewer, /Le CRM n’affiche pas un autre véhicule à sa place/);
  assert.match(viewer, /query\.data\.model\.licenseLabel/);
  assert.match(service, /vehicle-3d-match/);
  assert.match(edgeFunction, /api\.sketchfab\.com\/v3\/search/);
  assert.match(edgeFunction, /NonCommercial/i);
  assert.match(edgeFunction, /candidateScore/);
  assert.match(migration, /create table if not exists public\.vehicle_3d_models/);
  assert.match(migration, /enable row level security/);
  assert.match(config, /\[functions\.vehicle-3d-match\]\s+verify_jwt = true/);
});
