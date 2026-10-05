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

test('le lien court conserve un code aleatoire robuste et seule son empreinte est stockee', async () => {
  const migration = await read('supabase/migrations/20260914150000_client_document_portal_settings.sql');
  const edge = await read('supabase/functions/client-documents/index.ts');
  const service = await read('src/services/client-documents-service.ts');
  const routes = await read('src/app/app-routes.tsx');
  assert.match(migration, /gen_random_bytes\(18\)/);
  assert.match(migration, /digest\(convert_to\(v_token, 'UTF8'\), 'sha256'\)/);
  assert.match(edge, /\[0-9a-f\]\{64\}/);
  assert.match(edge, /\[A-Za-z0-9_-\]\{24\}/);
  assert.match(edge, /sha256\(token\)/);
  assert.match(service, /\/d\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(routes, /path="\/d\/:token"/);
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
  assert.match(service, /https:\/\/crm\.relaisparebrise\.fr/);
  assert.match(service, /\/d\/\$\{encodeURIComponent\(token\)\}/);
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

test('le client voit que chaque document est recu puis traite par l equipe', async () => {
  const page = await read('src/features/client-documents/client-documents-page.tsx');

  assert.match(page, /Document bien reçu/);
  assert.match(page, /Toutes les pièces nécessaires sont bien reçues/);
  assert.match(page, /Vous n’avez rien d’autre à faire pour le moment/);
  assert.match(page, /Le fichier est enregistré et sera vérifié par notre équipe/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /1\. Documents reçus/);
  assert.match(page, /2\. Vérification/);
  assert.match(page, /3\. Prochaine étape/);
});

test('la collecte demande les deux pieces obligatoires et propose deux pieces facultatives', async () => {
  const migration = await read('supabase/migrations/20260914120000_client_document_types.sql');
  const page = await read('src/features/client-documents/client-documents-page.tsx');

  assert.match(migration, /'registration', 'Carte grise', true/);
  assert.match(migration, /'insurance_cert', 'Attestation d’assurance', true/);
  assert.match(migration, /'technical_inspection', 'Contrôle technique', false/);
  assert.match(migration, /'other', 'Autre document', false/);
  assert.match(migration, /document_type in \([\s\S]*'technical_inspection'[\s\S]*'other'/);
  assert.match(page, /\{item\.required \? 'Obligatoire' : 'Facultatif'\}/);
  assert.match(page, /itemTypes\.has\('technical_inspection'\)/);
  assert.match(page, /itemTypes\.has\('other'\)/);
});

test('les reglages permettent de personnaliser le portail sans contourner les droits', async () => {
  const migration = await read('supabase/migrations/20260914150000_client_document_portal_settings.sql');
  const settingsPage = await read('src/features/client-documents/client-document-settings-page.tsx');
  const settingsService = await read('src/features/client-documents/client-document-settings-service.ts');
  const routes = await read('src/app/app-routes.tsx');
  const navigation = await read('src/config/navigation.ts');
  const permissions = await read('src/config/permissions.ts');
  const edge = await read('supabase/functions/client-documents/index.ts');

  assert.match(migration, /client_document_portal_settings enable row level security/);
  assert.equal((migration.match(/create policy "(?:select|insert|update|delete)_client_document_portal_settings"/g) ?? []).length, 4);
  assert.match(migration, /valid_client_document_rules/);
  assert.match(migration, /v_role not in \('admin', 'manager'\)/);
  assert.match(migration, /request\.status = 'open'/);
  assert.match(settingsService, /if \(error\) throw new Error\(error\.message\)/);
  assert.match(settingsService, /save_client_document_portal_settings/);
  assert.match(settingsPage, /Aperçu client/);
  assert.match(settingsPage, /Afficher le cadeau choisi/);
  assert.match(settingsPage, /Obligatoire/);
  assert.match(settingsPage, /migration des réglages documentaires doit être appliquée/);
  assert.match(routes, /path="documents" element=\{charger\(<ClientDocumentSettingsPage/);
  assert.match(navigation, /path: '\/settings\/documents'/);
  assert.match(permissions, /'\/settings\/documents': \['admin', 'manager'\]/);
  assert.match(edge, /client_document_portal_settings/);
  assert.match(edge, /visibleDocumentTypes/);
});

/*
 * Ce test exigeait l'inverse : l'alerte ne devait porter aucune donnee
 * client. La regle a ete levee a la demande explicite de l'equipe -- « il
 * faut que le nom du client soit precise ». L'alerte part vers l'adresse
 * interne de l'entreprise, sur ses propres clients ; c'est sa decision.
 *
 * Ce qui reste interdit n'a pas change : le mail ne transporte jamais le
 * document ni un lien vers le fichier. Il nomme, et renvoie vers le CRM, ou
 * la lecture demande une session.
 */
test('chaque depot prepare une alerte email interne qui nomme le client sans joindre la piece', async () => {
  const edge = await read('supabase/functions/client-documents/index.ts');
  const migration = await read('supabase/migrations/20260907120000_portail_documents_client.sql');
  assert.match(edge, /notifyDocumentDeposit/);
  assert.match(edge, /https:\/\/api\.resend\.com\/emails/);
  assert.match(edge, /DOCUMENT_NOTIFICATION_EMAIL/);
  assert.match(edge, /contact@relaisparebrise\.fr/);
  assert.ok(edge.includes('subject: `Document reçu — ${nomClient}`'));

  // Le document lui-meme ne sort pas : pas de piece jointe, pas d'URL
  // signee vers le stockage.
  const corpsMail = edge.slice(edge.indexOf('api.resend.com/emails'), edge.indexOf('if (!response.ok)'));
  assert.ok(!corpsMail.includes('createSignedUrl'));
  assert.ok(!corpsMail.includes('attachments'));
  assert.ok(!corpsMail.includes('storage_path'));

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

test('un nouveau lien ne masque pas les documents deja recus', async () => {
  const service = await read('src/services/client-documents-service.ts');
  const panel = await read('src/features/dossier/documents-client-panel.tsx');

  assert.match(service, /fetchClientDocumentRequests/);
  assert.match(service, /requests\.map\(\(request\) =>/);
  assert.match(panel, /slice\(1\)\.flatMap/);
  assert.match(panel, /Documents déjà reçus/);
  assert.match(panel, /restent disponibles même lorsqu’un nouveau lien a été créé/);
});
