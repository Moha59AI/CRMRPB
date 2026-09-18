import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la connexion IONOS ne stocke aucun mot de passe et reste isolee par workspace', async () => {
  const migration = await read('supabase/migrations/20260916100000_ionos_email_integration.sql');
  const service = await read('src/features/integrations/email/email-service.ts');

  assert.match(migration, /'meta', 'google', 'onify', 'ionos', 'custom'/);
  assert.match(migration, /integration_connections_ionos_unique/);
  assert.match(migration, /workspace_id, provider/);
  assert.match(migration, /sender_email text/);
  assert.match(migration, /email_attachments jsonb not null/);
  assert.doesNotMatch(service, /password|imap_password|smtp_password/i);
  assert.doesNotMatch(migration, /imap_password|smtp_password/i);
});

test('les emails sortants passent par le serveur et sont journalises seulement apres succes', async () => {
  const edge = await read('supabase/functions/email-send/index.ts');
  const page = await read('src/features/communications/communications-page.tsx');

  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /\['admin', 'manager', 'advisor'\]/);
  assert.match(edge, /Deno\.env\.get\('RESEND_API_KEY'\)/);
  assert.match(edge, /https:\/\/api\.resend\.com\/emails/);
  assert.match(edge, /Idempotency-Key/);
  assert.match(edge, /provider: 'resend-ionos'/);
  assert.match(page, /sendIonosEmail/);
  assert.doesNotMatch(page, /Email envoyé \(mode démo\)/);
});

test('le webhook entrant verifie la signature et rattache le message au client', async () => {
  const edge = await read('supabase/functions/email-inbound-webhook/index.ts');
  const config = await read('supabase/config.toml');

  assert.match(edge, /RESEND_WEBHOOK_SECRET/);
  assert.match(edge, /svix-id/);
  assert.match(edge, /crypto\.subtle\.sign/);
  assert.match(edge, /emails\/receiving/);
  assert.match(edge, /\.from\('contacts'\)/);
  assert.match(edge, /\.from\('leads'\)/);
  assert.match(edge, /\.from\('notifications'\)/);
  assert.match(edge, /type: 'email_inbound'/);
  assert.match(edge, /classifierCorrespondant/);
  assert.match(edge, /extraireImmatriculations/);
  assert.match(edge, /vehicle_registration/);
  assert.match(edge, /Email assureur/);
  assert.match(edge, /Email expert/);
  assert.match(config, /\[functions\.email-send\][\s\S]*verify_jwt = true/);
  assert.match(config, /\[functions\.email-inbound-webhook\][\s\S]*verify_jwt = false/);
});

test('les reglages IONOS sont accessibles aux administrateurs depuis les integrations', async () => {
  const [routes, navigation, permissions, list, settings] = await Promise.all([
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
    read('src/config/permissions.ts'),
    read('src/features/integrations/integrations-list-page.tsx'),
    read('src/features/integrations/email/email-settings-page.tsx'),
  ]);

  assert.match(routes, /path="integrations\/email"/);
  assert.match(navigation, /path: '\/settings\/integrations\/email'/);
  assert.match(permissions, /'\/settings\/integrations\/email': \['admin'\]/);
  assert.match(list, /Boîte mail IONOS/);
  assert.match(settings, /Votre mot de passe IONOS reste privé/);
  assert.match(settings, /email-inbound-webhook/);
});

test('la boite mail separe les recus des envoyes et detecte assureurs et experts', async () => {
  const [routes, navigation, inbox, service, classification] = await Promise.all([
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('src/features/integrations/email/email-service.ts'),
    read('src/features/integrations/email/email-classification.ts'),
  ]);

  assert.match(routes, /path="\/emails"/);
  assert.match(navigation, /label: 'Boîte mail'/);
  assert.match(inbox, /key: 'inbound', label: 'Reçus'/);
  assert.match(inbox, /key: 'insurers', label: 'Assureurs'/);
  assert.match(inbox, /key: 'experts', label: 'Experts'/);
  assert.match(inbox, /key: 'outbound', label: 'Envoyés'/);
  assert.match(inbox, /key: 'unlinked', label: 'Non rattachés'/);
  assert.match(inbox, /Voir la fiche/);
  assert.match(inbox, /Pièces jointes/);
  assert.match(service, /\.in\('type', \['email_inbound', 'email_outbound'\]\)/);
  assert.match(service, /\.range\(offset, offset \+ EMAIL_PAGE_SIZE - 1\)/);
  assert.match(classification, /insurer\.claims_email/);
  assert.match(classification, /solutions-expertises\.com/);
  assert.match(classification, /Détection probable à vérifier|probable/);
});
