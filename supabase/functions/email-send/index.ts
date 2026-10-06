import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { ImapFlow } from 'npm:imapflow@2.0.6';
import nodemailer from 'npm:nodemailer@10.0.10';
import { Buffer } from 'node:buffer';
import {
  IONOS_IMAP_HOST,
  IONOS_IMAP_PORT,
  IONOS_SMTP_HOST,
  IONOS_SMTP_PORT,
  readIonosPassword,
} from '../_shared/ionos-email.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_EMAIL_ATTACHMENTS = 5;
const MAX_EMAIL_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;
const EMAIL_ATTACHMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
};

type OutboundAttachment = {
  filename: string;
  contentType: string;
  contentBase64: string;
  size: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function emailValide(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function texte(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function extensionFichier(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function tailleBase64(value: string): number {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Le contenu d’une pièce jointe est invalide');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function piecesJointes(value: unknown): OutboundAttachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('Les pièces jointes sont invalides');
  if (value.length > MAX_EMAIL_ATTACHMENTS) {
    throw new Error(`${MAX_EMAIL_ATTACHMENTS} pièces jointes maximum par email`);
  }

  let total = 0;
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Une pièce jointe est invalide');
    const attachment = item as Record<string, unknown>;
    const rawFilename = texte(attachment.filename, 180);
    const filename = Array.from(rawFilename, (character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 || character === '/' || character === '\\'
        ? '_'
        : character;
    }).join('');
    const contentType = EMAIL_ATTACHMENT_TYPES[extensionFichier(filename)];
    if (!filename || !contentType) throw new Error(`Format de pièce jointe non autorisé : ${filename || 'sans nom'}`);

    const declaredType = texte(attachment.content_type, 200).toLowerCase();
    if (declaredType && declaredType !== contentType) {
      throw new Error(`Type de pièce jointe incohérent : ${filename}`);
    }

    const contentBase64 = typeof attachment.content_base64 === 'string'
      ? attachment.content_base64.trim()
      : '';
    if (contentBase64.length > Math.ceil(MAX_EMAIL_ATTACHMENT_BYTES * 4 / 3) + 4) {
      throw new Error(`${filename} dépasse la limite de 5 Mo`);
    }
    const size = tailleBase64(contentBase64);
    if (size <= 0) throw new Error(`Le fichier ${filename} est vide`);
    if (size > MAX_EMAIL_ATTACHMENT_BYTES) throw new Error(`${filename} dépasse la limite de 5 Mo`);
    total += size;
    if (total > MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES) {
      throw new Error('Les pièces jointes dépassent 10 Mo au total');
    }

    return { filename, contentType, contentBase64, size };
  });
}

function echapperHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ligneSignatureHtml(line: string): string {
  const normalized = line.trim();
  if (emailValide(normalized)) {
    return `<a href="mailto:${echapperHtml(normalized)}" style="color:#15803d;text-decoration:none">${echapperHtml(normalized)}</a>`;
  }
  if (/^(https?:\/\/|www\.)[^\s]+$/i.test(normalized)) {
    const href = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    return `<a href="${echapperHtml(href)}" style="color:#15803d;text-decoration:none">${echapperHtml(normalized)}</a>`;
  }
  return echapperHtml(normalized);
}

function construireSignatureHtml(signature: string, senderName: string, senderEmail: string): string {
  if (!signature.trim()) return '';
  const lines = signature.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const greeting = lines.find((line) => /^cordialement[,.]?$/i.test(line)) ?? 'Cordialement,';
  const details = lines.filter((line) => (
    !/^cordialement[,.]?$/i.test(line)
    && !/^service client$/i.test(line)
    && line.localeCompare(senderName, 'fr', { sensitivity: 'base' }) !== 0
  ));
  if (!details.some((line) => emailValide(line))) details.push(senderEmail);
  if (!details.some((line) => /^(https?:\/\/|www\.)/i.test(line))) details.push('www.relaisparebrise.fr');

  return [
    '<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif">',
    `<div style="margin-bottom:12px;font-size:13px;color:#6b7280">${echapperHtml(greeting)}</div>`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">',
    '<tr>',
    '<td style="vertical-align:middle;padding-right:14px">',
    '<div style="width:54px;height:54px;border-radius:16px;background:#16a34a;color:#ffffff;font-size:14px;font-weight:800;line-height:54px;text-align:center;letter-spacing:-1px">RPB</div>',
    '</td>',
    '<td style="vertical-align:middle;border-left:3px solid #16a34a;padding-left:14px">',
    `<div style="font-size:17px;font-weight:700;line-height:1.25;color:#111827">${echapperHtml(senderName)}</div>`,
    '<div style="margin-top:3px;font-size:11px;font-weight:700;line-height:1.4;color:#16a34a;text-transform:uppercase;letter-spacing:.6px">Service client · Relais Pare-Brise</div>',
    `<div style="margin-top:7px;font-size:12px;line-height:1.55;color:#6b7280;word-break:break-word">${details.map(ligneSignatureHtml).join(' &nbsp;·&nbsp; ')}</div>`,
    '</td>',
    '</tr>',
    '</table>',
    '<div style="margin-top:12px;font-size:10px;line-height:1.45;color:#9ca3af">Ce message vous est adressé par Relais Pare-Brise dans le cadre du suivi de votre dossier.</div>',
    '</div>',
  ].join('');
}

function construireEmailHtml(content: string, signature: string, senderName: string, senderEmail: string): string {
  const body = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.6;color:#111827;font-size:14px">${echapperHtml(content)}</div>`;
  return `<div style="max-width:680px">${body}${construireSignatureHtml(signature, senderName, senderEmail)}</div>`;
}

function base64Mime(value: string | Buffer): string {
  const encoded = Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value, 'utf8').toString('base64');
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function enteteUtf8(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value.replace(/[\r\n]+/g, ' '), 'utf8').toString('base64')}?=`;
}

function messageReferenceValide(value: string | null): value is string {
  return Boolean(value && /^<[^<>\r\n]+>$/.test(value));
}

/**
 * Reconstruit la copie RFC 5322 deposee dans « Envoyes ». L'envoi lui-meme
 * reste assure par Nodemailer/SMTP ; cette copie IMAP sert uniquement a ce que
 * le webmail IONOS et les autres appareils montrent le meme historique.
 */
function construireCopieMime(options: {
  senderName: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  content: string;
  htmlContent: string;
  messageId: string;
  inReplyTo: string | null;
  attachments: OutboundAttachment[];
}): Buffer {
  const alternative = `alternative-${crypto.randomUUID()}`;
  const mixed = `mixed-${crypto.randomUUID()}`;
  const headers = [
    `From: ${enteteUtf8(options.senderName)} <${options.senderEmail}>`,
    `To: <${options.recipientEmail}>`,
    `Subject: ${enteteUtf8(options.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${options.messageId}`,
    'MIME-Version: 1.0',
  ];
  if (messageReferenceValide(options.inReplyTo)) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`, `References: ${options.inReplyTo}`);
  }

  const corpsAlternatif = [
    `--${alternative}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Mime(options.content),
    `--${alternative}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Mime(options.htmlContent),
    `--${alternative}--`,
  ];

  if (options.attachments.length === 0) {
    return Buffer.from([
      ...headers,
      `Content-Type: multipart/alternative; boundary="${alternative}"`,
      '',
      ...corpsAlternatif,
      '',
    ].join('\r\n'), 'utf8');
  }

  const pieces = options.attachments.flatMap((attachment) => {
    const asciiFilename = attachment.filename
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_');
    return [
      `--${mixed}`,
      `Content-Type: ${attachment.contentType}; name="${asciiFilename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      '',
      base64Mime(Buffer.from(attachment.contentBase64, 'base64')),
    ];
  });

  return Buffer.from([
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    '',
    ...corpsAlternatif,
    ...pieces,
    `--${mixed}--`,
    '',
  ].join('\r\n'), 'utf8');
}

async function copierDansEnvoyesIonos(options: {
  senderEmail: string;
  password: string;
  rawMessage: Buffer;
}): Promise<string> {
  const client = new ImapFlow({
    host: IONOS_IMAP_HOST,
    port: IONOS_IMAP_PORT,
    secure: true,
    auth: { user: options.senderEmail, pass: options.password },
    logger: false,
    disableAutoIdle: true,
    disableCompression: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
    tls: { minVersion: 'TLSv1.2', servername: IONOS_IMAP_HOST },
  });
  client.on('error', (error) => console.error('IONOS IMAP SENT:', error.message));

  try {
    await client.connect();
    const mailboxes = await client.list();
    const sent = mailboxes.find((mailbox) => mailbox.specialUse === '\\Sent')
      ?? mailboxes.find((mailbox) => /^(sent|sent items|gesendet|envoy[eé]s|messages envoy[eé]s)$/i.test(mailbox.path));
    if (!sent) throw new Error('DOSSIER_ENVOYES_INTROUVABLE');
    const appended = await client.append(sent.path, options.rawMessage, ['\\Seen'], new Date());
    if (!appended) throw new Error('COPIE_ENVOYES_REFUSEE');
    return sent.path;
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
}

async function utilisateur(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('FORBIDDEN');
  if (!['admin', 'manager', 'advisor'].includes(profile.role)) throw new Error('FORBIDDEN');
  return { userId: data.user.id, workspaceId: profile.workspace_id as string };
}

async function connexion(workspaceId: string) {
  const { data, error } = await admin
    .from('integration_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'ionos')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function adresseDestinataire(
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<{ email: string; contactId: string | null; leadId: string | null }> {
  const contactId = texte(body.contact_id, 80) || null;
  const leadId = texte(body.lead_id, 80) || null;
  const direct = texte(body.to, 254).toLowerCase();

  if (contactId) {
    const { data, error } = await admin
      .from('contacts')
      .select('id, email')
      .eq('id', contactId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('CLIENT_INTROUVABLE');
    const email = direct || data.email?.trim().toLowerCase() || '';
    if (!emailValide(email)) throw new Error('EMAIL_DESTINATAIRE_INVALIDE');
    return { email, contactId: data.id, leadId };
  }

  if (leadId) {
    const { data, error } = await admin
      .from('leads')
      .select('id, contact_id, email')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('LEAD_INTROUVABLE');
    const email = direct || data.email?.trim().toLowerCase() || '';
    if (!emailValide(email)) throw new Error('EMAIL_DESTINATAIRE_INVALIDE');
    return { email, contactId: data.contact_id, leadId: data.id };
  }

  if (!emailValide(direct)) throw new Error('EMAIL_DESTINATAIRE_INVALIDE');
  return { email: direct, contactId: null, leadId: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let connectionId: string | null = null;
  try {
    const { userId, workspaceId } = await utilisateur(req);
    const body = await req.json() as Record<string, unknown>;
    const connection = await connexion(workspaceId);
    connectionId = connection?.id ?? null;
    const settings = (connection?.settings ?? {}) as Record<string, unknown>;
    const senderEmail = texte(settings.email_address, 254).toLowerCase();
    const senderName = texte(settings.sender_name, 100).replace(/[\r\n]/g, '') || 'Relais Pare-Brise';
    const password = connection ? await readIonosPassword(admin, workspaceId) : null;
    const configured = Boolean(connection && emailValide(senderEmail) && password);

    if (body.action === 'status') {
      return json({
        configured,
        email_address: configured ? senderEmail : null,
        connection_status: connection?.status ?? 'not_configured',
      });
    }

    if (!connection || !emailValide(senderEmail)) throw new Error('BOITE_IONOS_NON_CONFIGUREE');
    if (!password) throw new Error('MOT_DE_PASSE_IONOS_ABSENT');

    const subject = texte(body.subject, 200);
    const content = texte(body.content, 20_000);
    const signature = texte(body.signature, 2_000);
    if (!subject) throw new Error('OBJET_REQUIS');
    if (!content) throw new Error('MESSAGE_REQUIS');
    const attachments = piecesJointes(body.attachments);

    const recipient = await adresseDestinataire(workspaceId, body);
    const requestId = /^[0-9a-f-]{36}$/i.test(texte(body.request_id, 36))
      ? texte(body.request_id, 36)
      : crypto.randomUUID();
    const inReplyTo = texte(body.in_reply_to, 500) || null;
    const messageId = `<crm.${workspaceId}.${requestId}@relaisparebrise.fr>`;
    const transporter = nodemailer.createTransport({
      host: IONOS_SMTP_HOST,
      port: IONOS_SMTP_PORT,
      secure: true,
      auth: { user: senderEmail, pass: password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      tls: { minVersion: 'TLSv1.2', servername: IONOS_SMTP_HOST },
    });

    let smtpMessageId = messageId;
    let smtpAcceptedAt: string | null = null;
    let sentCopySavedAt: string | null = null;
    let sentCopyError: string | null = null;
    const fullContent = signature ? `${content}\n\n${signature}` : content;
    const htmlContent = construireEmailHtml(content, signature, senderName, senderEmail);
    try {
      const result = await transporter.sendMail({
        from: { name: senderName, address: senderEmail },
        to: recipient.email,
        replyTo: senderEmail,
        subject,
        text: fullContent,
        html: htmlContent,
        messageId,
        ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}),
        ...(attachments.length ? {
          attachments: attachments.map((attachment) => ({
            filename: attachment.filename,
            content: Buffer.from(attachment.contentBase64, 'base64'),
            contentType: attachment.contentType,
          })),
        } : {}),
      });
      if (Array.isArray(result.rejected) && result.rejected.length > 0) {
        throw new Error(`IONOS_SMTP_REFUSE: ${result.rejected.join(', ')}`);
      }
      smtpMessageId = typeof result.messageId === 'string' && result.messageId
        ? result.messageId
        : messageId;
      smtpAcceptedAt = new Date().toISOString();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`IONOS_SMTP_ERROR: ${detail}`);
    } finally {
      transporter.close();
    }

    // Un SMTP accepte confirme la transmission au serveur IONOS, mais ne
    // remplit pas le dossier « Envoyes ». La copie IMAP est donc une seconde
    // operation. Son echec ne doit jamais provoquer un deuxieme envoi.
    try {
      const rawMessage = construireCopieMime({
        senderName,
        senderEmail,
        recipientEmail: recipient.email,
        subject,
        content: fullContent,
        htmlContent,
        messageId: smtpMessageId,
        inReplyTo,
        attachments,
      });
      await copierDansEnvoyesIonos({ senderEmail, password, rawMessage });
      sentCopySavedAt = new Date().toISOString();
    } catch (error) {
      sentCopyError = error instanceof Error ? error.message : String(error);
      console.error('IONOS SENT COPY:', sentCopyError);
    }

    const { data: communication, error: communicationError } = await admin
      .from('communications')
      .upsert({
        workspace_id: workspaceId,
        contact_id: recipient.contactId,
        lead_id: recipient.leadId,
        user_id: userId,
        type: 'email_outbound',
        direction: 'outbound',
        status: 'sent',
        subject,
        content: fullContent,
        email_html: htmlContent,
        provider: 'ionos-smtp',
        external_id: smtpMessageId,
        email_message_id: smtpMessageId,
        email_smtp_accepted_at: smtpAcceptedAt,
        email_sent_copy_saved_at: sentCopySavedAt,
        sender_email: senderEmail,
        recipient_email: recipient.email,
        email_in_reply_to: inReplyTo,
        email_attachments: attachments.map((attachment, index) => ({
          id: `outbound-${requestId}-${index + 1}`,
          filename: attachment.filename,
          content_type: attachment.contentType,
          size: attachment.size,
        })),
      }, { onConflict: 'workspace_id,provider,external_id' })
      .select('*')
      .single();
    if (communicationError) throw new Error(communicationError.message);

    await admin.from('integration_connections').update({
      status: 'connected',
      last_tested_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: sentCopyError ? `COPIE_ENVOYES_IONOS_IMPOSSIBLE: ${sentCopyError}` : null,
    }).eq('id', connection.id);

    return json({ success: true, communication });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (connectionId) {
      const integrationFailure = message.startsWith('IONOS_')
        || message === 'MOT_DE_PASSE_IONOS_ABSENT'
        || message === 'BOITE_IONOS_NON_CONFIGUREE';
      await admin.from('integration_connections').update({
        ...(integrationFailure ? { status: 'error' } : {}),
        last_error: message,
        last_tested_at: new Date().toISOString(),
      }).eq('id', connectionId);
    }
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return json({ success: false, error: message }, status);
  }
});
