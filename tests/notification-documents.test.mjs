import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const PORTAIL = 'supabase/functions/client-documents/index.ts';
const NOTIFICATION = 'supabase/functions/_shared/document-notification.ts';

test('le mail de dépôt nomme le client et la pièce', async () => {
  const fonction = await read(NOTIFICATION);

  // « Une nouvelle pièce vient d'être déposée » ne disait ni qui ni quoi.
  assert.ok(fonction.includes('subject: `Document reçu — ${nomClient}`'));
  assert.ok(fonction.includes('a déposé : <strong>${texteHtml(nomPiece)}</strong>'));
  assert.ok(!fonction.includes("subject: 'Nouveau document client reçu'"));
});

test('le mail mène au dossier, pas à l’accueil', async () => {
  const fonction = await read(NOTIFICATION);

  // Il fallait retrouver le dossier a la main depuis l'accueil.
  assert.ok(fonction.includes('crm.relaisparebrise.fr/interventions/${leadId}'));
  assert.ok(fonction.includes('Ouvrir le dossier'));
});

test('un nom de client ne peut pas casser le mail', async () => {
  const fonction = await read(NOTIFICATION);

  // Le nom vient du client : il peut contenir &, < ou >.
  assert.match(fonction, /function texteHtml/);
  assert.ok(fonction.includes("replace(/&/g, '&amp;')"));
});

test('la notification dans le CRM nomme aussi le client', async () => {
  const migration = await read('supabase/migrations/20261007100000_notifier_depot_documents_client.sql');

  assert.match(migration, /concat\('Document reçu — ', v_nom_client\)/);
  assert.match(migration, /coalesce\(v_nom_client, 'Client sans nom'\)/);
  assert.match(migration, /new\.label/);
  assert.match(migration, /\?tab=documents/);
  assert.match(migration, /profil\.role in \('admin', 'manager', 'advisor'\)/);
});

test('chaque dépôt déclenche l’alerte sans dépendre de l’email', async () => {
  const fonction = await read(PORTAIL);
  const migration = await read('supabase/migrations/20261007100000_notifier_depot_documents_client.sql');

  assert.match(migration, /after update of status, uploaded_at on public\.client_document_items/);
  assert.match(migration, /new\.status = 'uploaded'/);
  assert.match(migration, /old\.uploaded_at is distinct from new\.uploaded_at/);

  const majLead = fonction.indexOf("await admin.from('leads').update");
  const email = fonction.indexOf('await notifyDocumentDeposit', majLead);
  assert.ok(majLead >= 0 && email > majLead, 'l’email ne doit plus bloquer le rattachement en base');
  assert.match(fonction, /catch \(notificationError\)/);
});

test('la commerciale reçoit aussi les alertes de dépôt, sans doublon', async () => {
  const [notification, migration, website] = await Promise.all([
    read(NOTIFICATION),
    read('supabase/migrations/20261127170000_alerte_documents_commerciale.sql'),
    read('supabase/functions/inbound-webhook/index.ts'),
  ]);

  assert.match(migration, /l\.benamar@relaisparebrise\.fr/);
  assert.match(migration, /where slug = 'relais-pare-brise'/);
  assert.match(notification, /settings\.document_notification_emails/);
  assert.match(notification, /new Set\(groups\.flat\(\)\)/);
  assert.match(notification, /to: recipients/);
  assert.match(website, /notifyDocumentDeposit\(supabase, itemId, workspaceId, leadId\)/);
});

test('la notification ouvre directement les documents de la fiche', async () => {
  const fiche = await read('src/features/dossier/dossier-modal.tsx');

  assert.match(fiche, /new URLSearchParams\(location\.search\)\.get\('tab'\)/);
  assert.match(fiche, /if \(ongletDemande\) setOnglet\(ongletDemande\)/);
});

test('le push sur écran verrouillé ne nomme toujours personne', async () => {
  const push = await read('supabase/functions/web-push/index.ts');

  // Decision deliberee : un nom de client ne doit pas s'afficher sur un
  // telephone pose sur une table.
  const debut = push.indexOf('const safePushByType');
  const bloc = push.slice(debut, push.indexOf('};', debut));
  assert.ok(bloc.includes("title: 'Documents client reçus'"));
  assert.ok(!/nomClient|first_name|last_name/.test(bloc));
});
