import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la connexion IONOS conserve le mot de passe uniquement dans Vault et reste isolee par workspace', async () => {
  const migration = await read('supabase/migrations/20260925140000_ionos_imap_smtp.sql');
  const service = await read('src/features/integrations/email/email-service.ts');
  const secretEdge = await read('supabase/functions/ionos-email-secret/index.ts');
  const secretHelper = await read('supabase/functions/_shared/ionos-email.ts');

  assert.match(secretHelper, /ionos_email_password_\$\{workspaceId\}/);
  assert.match(secretHelper, /vault_read_secret/);
  assert.match(secretHelper, /vault_(update|create)_secret/);
  assert.match(secretEdge, /profile\.role !== 'admin'/);
  assert.match(secretEdge, /writeIonosPassword/);
  assert.doesNotMatch(service, /settings:[^\n]*(password|imap_password|smtp_password)/i);
  assert.doesNotMatch(migration, /imap_password|smtp_password/i);
});

test('les emails sortants passent par le serveur et sont journalises seulement apres succes', async () => {
  const edge = await read('supabase/functions/email-send/index.ts');
  const page = await read('src/features/integrations/email/email-inbox-page.tsx');

  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /\['admin', 'manager', 'advisor'\]/);
  assert.match(edge, /nodemailer@10\.0\.10/);
  assert.match(edge, /IONOS_SMTP_HOST/);
  assert.match(edge, /IONOS_SMTP_PORT/);
  assert.match(edge, /readIonosPassword/);
  assert.match(edge, /provider: 'ionos-smtp'/);
  assert.match(edge, /email_smtp_accepted_at: smtpAcceptedAt/);
  assert.match(edge, /email_sent_copy_saved_at: sentCopySavedAt/);
  assert.doesNotMatch(edge, /api\.resend\.com/);
  assert.match(page, /sendIonosEmail/);
  assert.doesNotMatch(page, /Email envoyé \(mode démo\)/);
});

test('un email accepte par SMTP est copie dans les Envoyes IONOS sans risque de double envoi', async () => {
  const [edge, migration, header, types] = await Promise.all([
    read('supabase/functions/email-send/index.ts'),
    read('supabase/migrations/20261006120000_preuve_envoi_email_ionos.sql'),
    read('src/features/integrations/email/entete-message.tsx'),
    read('src/types/index.ts'),
  ]);

  assert.match(edge, /ImapFlow/);
  assert.match(edge, /mailbox\.specialUse === '\\\\Sent'/);
  assert.match(edge, /client\.append\(sent\.path, options\.rawMessage, \['\\\\Seen'\]/);
  assert.match(edge, /Son echec ne doit jamais provoquer un deuxieme envoi/);
  assert.match(migration, /email_smtp_accepted_at timestamptz/);
  assert.match(migration, /email_sent_copy_saved_at timestamptz/);
  assert.match(header, /Accepté par le serveur SMTP IONOS/);
  assert.match(header, /copie classée dans le dossier Envoyés IONOS/);
  assert.match(types, /email_sent_copy_saved_at: string \| null/);
});

test('la synchronisation IMAP rattache les messages et notifie les utilisateurs', async () => {
  const edge = await read('supabase/functions/ionos-mail-sync/index.ts');
  const ingest = await read('supabase/functions/_shared/inbound-email.ts');
  const config = await read('supabase/config.toml');

  assert.match(edge, /ImapFlow/);
  assert.match(edge, /imapflow@2\.0\.6/);
  assert.match(edge, /PostalMime/);
  assert.match(edge, /IONOS_IMAP_HOST/);
  assert.match(edge, /readOnly: true/);
  assert.match(edge, /email-attachments/);
  assert.match(edge, /imap_last_uid/);
  assert.match(edge, /MAX_MESSAGES_PER_SYNC/);
  assert.match(ingest, /\.from\('contacts'\)/);
  assert.match(ingest, /\.from\('leads'\)/);
  assert.match(ingest, /\.from\('notifications'\)/);
  assert.match(ingest, /type: 'email_inbound'/);
  assert.match(ingest, /email_html: email\.html/);
  assert.match(ingest, /classifierCorrespondant/);
  assert.match(ingest, /extraireImmatriculations/);
  assert.match(ingest, /vehicle_registration/);
  assert.match(ingest, /Email assureur/);
  assert.match(ingest, /Email expert/);
  assert.match(ingest, /Email fournisseur/);
  assert.match(config, /\[functions\.email-send\][\s\S]*verify_jwt = true/);
  assert.match(config, /\[functions\.ionos-email-secret\][\s\S]*verify_jwt = true/);
  assert.match(config, /\[functions\.ionos-mail-sync\][\s\S]*verify_jwt = false/);
});

test('le HTML des emails reste isole et les anciens messages sont enrichis progressivement', async () => {
  const [sync, viewer, security, migration, types] = await Promise.all([
    read('supabase/functions/ionos-mail-sync/index.ts'),
    read('src/features/integrations/email/email-html-viewer.tsx'),
    read('src/features/integrations/email/email-html-security.ts'),
    read('supabase/migrations/20261005110000_email_html_manual_lead_link.sql'),
    read('src/types/index.ts'),
  ]);

  assert.match(sync, /parsed\.html\.trim\(\)\.slice\(0, MAX_HTML_BYTES\)/);
  assert.match(sync, /uidsSansHtml/);
  assert.match(sync, /update\(\{ email_html: html \?\? '' \}\)/);
  assert.match(security, /Content-Security-Policy/);
  assert.match(viewer, /sandbox=""/);
  assert.match(viewer, /referrerPolicy="no-referrer"/);
  assert.match(viewer, /Afficher les images externes/);
  assert.doesNotMatch(viewer, /dangerouslySetInnerHTML/);
  assert.match(migration, /add column if not exists email_html text/);
  // Indifférent aux fins de ligne : une copie de travail Windows contient
  // `/*\r\n`, et l'assertion échouait sur tout poste Windows.
  assert.match(migration, /^\/\*\r?\n/);
  assert.match(types, /email_html: string \| null/);
});

test('un email peut etre rattache manuellement a un lead sans modifier son contenu', async () => {
  const [migration, service, dialog, inbox] = await Promise.all([
    read('supabase/migrations/20261005110000_email_html_manual_lead_link.sql'),
    read('src/features/integrations/email/email-service.ts'),
    read('src/features/integrations/email/email-lead-link-dialog.tsx'),
    read('src/features/integrations/email/email-inbox-page.tsx'),
  ]);

  assert.match(migration, /function public\.rattacher_email_au_lead/);
  assert.match(migration, /type in \('email_inbound', 'email_outbound'\)/);
  assert.match(migration, /set lead_id = v_lead\.id/);
  assert.doesNotMatch(migration, /set content\s*=/);
  assert.match(migration, /'email_lead_linked'/);
  assert.match(migration, /insert into public\.audit_logs/);
  assert.match(service, /rpc\('rattacher_email_au_lead'/);
  assert.match(dialog, /Rattacher cet email à un lead/);
  assert.match(inbox, /Rattacher à un lead/);
  assert.match(inbox, /EmailLeadLinkDialog/);
});

test('le webhook Resend est définitivement neutralise pour la boite mail', async () => {
  const webhook = await read('supabase/functions/email-inbound-webhook/index.ts');

  assert.match(webhook, /RESEND_RETIRED_IONOS_IMAP_ACTIVE/);
  assert.match(webhook, /status: 200/);
  assert.doesNotMatch(webhook, /RESEND_WEBHOOK_SECRET|RESEND_API_KEY|api\.resend\.com/);
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
  assert.match(settings, /Connexion directe à IONOS, sans Resend/);
  assert.match(settings, /Synchroniser maintenant/);
  assert.match(settings, /Enregistrer et vérifier/);
  assert.doesNotMatch(settings, /email-inbound-webhook/);
});

test('la boite mail separe les recus des envoyes et detecte assureurs experts et fournisseurs', async () => {
  const [routes, navigation, inbox, service, classification] = await Promise.all([
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('src/features/integrations/email/email-service.ts'),
    read('src/features/integrations/email/email-classification.ts'),
  ]);

  assert.match(routes, /path="\/emails"/);
  assert.match(navigation, /label: 'Boîte mail'/);
  // Les vues sont passees des pastilles horizontales au rail vertical, mais
  // ce sont les memes, toutes atteignables.
  assert.match(inbox, /label: 'Boîte de réception'/);
  assert.match(inbox, /label: 'Fournisseurs'/);
  assert.match(inbox, /label: 'Assureurs'/);
  assert.match(inbox, /label: 'Experts'/);
  assert.match(inbox, /label: 'Envoyés'/);
  assert.match(inbox, /label: 'Non rattachés'/);
  assert.match(inbox, /Voir la fiche/);
  assert.match(inbox, /Pièces jointes/);
  assert.match(service, /\.in\('type', \['email_inbound', 'email_outbound'\]\)/);
  assert.match(service, /EMAIL_LIST_COLUMNS/);
  assert.match(service, /fetchEmailHtml/);
  assert.match(service, /\.range\(offset, offset \+ EMAIL_PAGE_SIZE - 1\)/);
  assert.match(classification, /insurer\.claims_email/);
  assert.match(classification, /solutions-expertises\.com/);
  assert.match(classification, /vsf41\.com/);
  assert.match(classification, /nsg\.com/);
  assert.match(classification, /category: 'supplier'/);
  assert.match(classification, /Détection probable à vérifier|probable/);
});

test('les PDF de VSF et Pilkington sont sortis dans les documents fournisseur', async () => {
  const [inbox, ingest, sync] = await Promise.all([
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('supabase/functions/_shared/inbound-email.ts'),
    read('supabase/functions/ionos-mail-sync/index.ts'),
  ]);

  assert.match(ingest, /domainesFournisseurs/);
  assert.match(ingest, /vsf41\.com/);
  assert.match(ingest, /nsg\.com/);
  assert.match(sync, /stockerPiecesJointes/);
  assert.match(sync, /storage_path: storagePath/);
  assert.match(inbox, /function isPdfAttachment/);
  assert.match(inbox, /Documents fournisseur/);
  // Le libellé a été resserré sur une ligne ; il dit toujours que le PDF a
  // été sorti de l'email sans qu'on le demande.
  assert.match(inbox, /sorti'\} automatiquement/);
  assert.match(inbox, /supplierPdfs\.map/);
  assert.match(inbox, /openAttachment\(attachment\)/);
});

test('la boite mail est un module autonome et les communications excluent les emails', async () => {
  const [inbox, communications, navigation, permissions] = await Promise.all([
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('src/features/communications/communications-page.tsx'),
    read('src/config/navigation.ts'),
    read('src/config/permissions.ts'),
  ]);

  assert.match(inbox, /Nouveau message/);
  assert.match(inbox, /function NewEmailDialog/);
  assert.match(inbox, /syncIonosMailbox/);
  assert.match(inbox, /Dernière synchronisation/);
  assert.match(inbox, /sendIonosEmail/);
  assert.match(communications, /return !comm\.type\.startsWith\('email'\)/);
  assert.doesNotMatch(communications, /EmailDialog|EmailAttachmentPicker|sendIonosEmail/);
  assert.match(navigation, /description: 'SMS, appels et notes'/);
  assert.match(permissions, /'\/emails': \['admin', 'manager', 'advisor'\]/);
});

test('les pieces jointes sont ouvertes via un relais authentifie et les reponses restent dans le fil', async () => {
  const [inbox, service, attachmentEdge, config] = await Promise.all([
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('src/features/integrations/email/email-service.ts'),
    read('supabase/functions/email-attachment/index.ts'),
    read('supabase/config.toml'),
  ]);

  assert.match(inbox, /fetchEmailAttachment/);
  assert.match(inbox, /sendIonosEmail/);
  assert.match(inbox, /in_reply_to: email\.email_message_id/);
  assert.match(inbox, /Répondre à ce message/);
  assert.match(inbox, /Aperçu sécurisé de la pièce jointe reçue par email/);
  assert.match(inbox, /Télécharger/);
  assert.match(inbox, /link\.download = attachmentViewer\.attachment\.filename/);
  assert.doesNotMatch(inbox, /window\.open\(/);
  assert.match(service, /functions\/v1\/email-attachment/);
  assert.match(attachmentEdge, /admin\.auth\.getUser\(token\)/);
  assert.match(attachmentEdge, /\['admin', 'manager', 'advisor'\]/);
  assert.match(attachmentEdge, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(attachmentEdge, /\.eq\('type', 'email_inbound'\)/);
  assert.match(attachmentEdge, /email_attachments/);
  assert.match(attachmentEdge, /communication\.provider === 'ionos-imap'/);
  assert.match(attachmentEdge, /from\('email-attachments'\)/);
  assert.match(attachmentEdge, /storage_path/);
  assert.match(attachmentEdge, /Cache-Control': 'private, no-store'/);
  assert.match(config, /\[functions\.email-attachment\][\s\S]*verify_jwt = true/);
});

test('la signature est personnalisable visible pendant la redaction et jointe aux emails', async () => {
  const [service, settings, inbox] = await Promise.all([
    read('src/features/integrations/email/email-service.ts'),
    read('src/features/integrations/email/email-settings-page.tsx'),
    read('src/features/integrations/email/email-inbox-page.tsx'),
  ]);

  assert.match(service, /signature: string/);
  assert.match(service, /buildDefaultEmailSignature/);
  assert.match(service, /buildSignedEmailContent/);
  assert.match(settings, /Signature automatique/);
  assert.match(settings, /Aperçu de la signature/);
  assert.match(inbox, /Signature ajoutée à l’envoi/);
  assert.match(inbox, /buildSignedEmailContent\(content, signature\)/);
});

test('la boite mail reste exploitable sur telephone sans comprimer la lecture ni la redaction', async () => {
  const [inbox, settings, entete] = await Promise.all([
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('src/features/integrations/email/email-settings-page.tsx'),
    read('src/features/integrations/email/entete-message.tsx'),
  ]);

  assert.match(inbox, /mobileDetailOpen \? 'hidden lg:block'/);
  // Les metadonnees etaient un tableau encadre de cinq lignes, toujours
  // deplie. Elles tiennent desormais dans un en-tete repliable, dont le
  // detail garde une colonne d'etiquettes lisible sur telephone.
  assert.match(entete, /grid-cols-\[72px_minmax\(0,1fr\)\]/);
  assert.match(entete, /min-w-0 truncate/);
  assert.match(inbox, /h-\[100dvh\][^\n]*grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(settings, /mt-5 grid gap-2 sm:flex sm:flex-wrap/);
});

test('les nouveaux emails et les reponses acceptent des pieces jointes controlees cote client et serveur', async () => {
  const [service, picker, inbox, edge] = await Promise.all([
    read('src/features/integrations/email/email-service.ts'),
    read('src/features/integrations/email/email-attachment-picker.tsx'),
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('supabase/functions/email-send/index.ts'),
  ]);

  assert.match(service, /attachments\?: EmailAttachmentInput\[\]/);
  assert.match(service, /MAX_EMAIL_ATTACHMENTS = 5/);
  assert.match(service, /MAX_EMAIL_ATTACHMENT_BYTES = 5 \* 1024 \* 1024/);
  assert.match(service, /prepareEmailAttachments/);
  assert.match(service, /reader\.readAsDataURL\(file\)/);
  assert.match(picker, /type="file"/);
  assert.match(picker, /multiple/);
  assert.match(picker, /Retirer \$\{file\.name\}/);
  assert.match(inbox, /prepareEmailAttachments\(attachments\)/);
  assert.match(inbox, /files=\{attachments\}/);
  assert.match(inbox, /prepareEmailAttachments\(replyAttachments\)/);
  assert.match(inbox, /files=\{replyAttachments\}/);

  assert.match(edge, /function piecesJointes/);
  assert.match(edge, /MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES/);
  assert.match(edge, /Buffer\.from\(attachment\.contentBase64, 'base64'\)/);
  assert.match(edge, /contentType: attachment\.contentType/);
  assert.match(edge, /email_attachments: attachments\.map/);
  assert.match(edge, /filename: attachment\.filename/);
  assert.doesNotMatch(edge, /email_attachments:[\s\S]{0,300}content_base64/);
  assert.match(inbox, /Leur contenu n’est pas conservé dans le CRM/);
});
