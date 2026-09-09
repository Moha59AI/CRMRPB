import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le portail documentaire ne rend ni le bucket ni les tables publics', async () => {
  const migration = await read('supabase/migrations/20260907120000_portail_documents_client.sql');
  assert.match(migration, /client_document_requests enable row level security/);
  assert.match(migration, /client_document_items enable row level security/);
  assert.match(migration, /'client-documents', 'client-documents', false/);
  assert.equal((migration.match(/create policy "(?:select|insert|update|delete)_client_document_requests"/g) ?? []).length, 4);
  assert.equal((migration.match(/create policy "(?:select|insert|update|delete)_client_document_items"/g) ?? []).length, 4);
  assert.doesNotMatch(migration, /to anon/);
});

test('le jeton du client est long et seule son empreinte est conservee', async () => {
  const migration = await read('supabase/migrations/20260907120000_portail_documents_client.sql');
  const edge = await read('supabase/functions/client-documents/index.ts');
  assert.match(migration, /gen_random_bytes\(32\)/);
  assert.match(migration, /digest\(convert_to\(v_token, 'UTF8'\), 'sha256'\)/);
  assert.match(edge, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(edge, /sha256\(token\)/);
});

test('les depots refusent les formats dangereux et les fichiers trop lourds', async () => {
  const edge = await read('supabase/functions/client-documents/index.ts');
  assert.match(edge, /application\/pdf/);
  assert.match(edge, /image\/jpeg/);
  assert.match(edge, /12 \* 1024 \* 1024/);
  assert.match(edge, /createSignedUploadUrl/);
  assert.match(edge, /startsWith\(expectedPrefix\)/);
});

test('la fiche et les relances envoient le nouveau lien client', async () => {
  const routes = await read('src/app/app-routes.tsx');
  const fiche = await read('src/features/dossier/dossier-modal.tsx');
  const relances = await read('src/features/relances/relances-page.tsx');
  const panel = await read('src/features/dossier/documents-client-panel.tsx');
  const service = await read('src/services/client-documents-service.ts');
  assert.match(routes, /path="\/documents"/);
  assert.match(fiche, /createClientDocumentRequest/);
  assert.match(relances, /createClientDocumentRequest/);
  assert.match(panel, /Collecte des documents/);
  assert.match(service, /https:\/\/crm\.relaisparebrise\.fr\/documents/);
  assert.doesNotMatch(service, /https:\/\/client\.relaisparebrise\.fr\/documents/);
});

test('le portail rassure le client sur le cadeau reellement choisi', async () => {
  const edge = await read('supabase/functions/client-documents/index.ts');
  const page = await read('src/features/client-documents/client-documents-page.tsx');
  const service = await read('src/services/client-documents-service.ts');
  assert.match(edge, /select\('first_name, last_name, offer'\)/);
  assert.match(edge, /selected_offer: lead\.offer/);
  assert.match(service, /selected_offer: string \| null/);
  assert.match(page, /Votre cadeau est réservé/);
  assert.match(page, /data\.selected_offer/);
});

test('chaque depot prepare une alerte email interne sans transmettre les donnees client', async () => {
  const edge = await read('supabase/functions/client-documents/index.ts');
  const migration = await read('supabase/migrations/20260907120000_portail_documents_client.sql');
  assert.match(edge, /notifyDocumentDeposit/);
  assert.match(edge, /https:\/\/api\.resend\.com\/emails/);
  assert.match(edge, /DOCUMENT_NOTIFICATION_EMAIL/);
  assert.match(edge, /contact@relaisparebrise\.fr/);
  assert.doesNotMatch(edge, /subject: `Document reçu/);
  assert.match(migration, /notification_email_sent_at timestamptz/);
  assert.match(migration, /notification_email_error text/);
});

test('la fiche client consolide les documents de toutes ses interventions', async () => {
  const modal = await read('src/features/client/client-modal.tsx');
  const history = await read('src/features/client-documents/client-document-history.tsx');
  const service = await read('src/services/client-documents-service.ts');
  assert.match(modal, /cle: 'documents'/);
  assert.match(modal, /<ClientDocumentHistory/);
  assert.match(history, /Documents de toutes les interventions/);
  assert.match(service, /fetchClientDocumentHistory/);
});

test('le document est ouvert par un vrai lien deja signe', async () => {
  const service = await read('src/services/client-documents-service.ts');
  const panel = await read('src/features/dossier/documents-client-panel.tsx');
  const history = await read('src/features/client-documents/client-document-history.tsx');
  const link = await read('src/features/client-documents/staff-document-link.tsx');

  assert.match(service, /createSignedUrl\(path, 3600\)/);
  assert.match(link, /createStaffDocumentPreviewUrl\(storagePath\)/);
  assert.match(link, /href=\{preview\.data\}/);
  assert.match(panel, /<StaffDocumentLink storagePath=\{item\.storage_path\}/);
  assert.match(history, /<StaffDocumentLink storagePath=\{item\.storage_path\}/);
  assert.doesNotMatch(link, /window\.open/);
  assert.doesNotMatch(link, /target="_blank"/);
});
