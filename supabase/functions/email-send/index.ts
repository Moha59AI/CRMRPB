import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

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
    const configured = Boolean(connection && emailValide(senderEmail));

    if (body.action === 'status') {
      return json({
        configured,
        email_address: configured ? senderEmail : null,
        connection_status: connection?.status ?? 'not_configured',
      });
    }

    if (!connection || !emailValide(senderEmail)) throw new Error('BOITE_IONOS_NON_CONFIGUREE');
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('RESEND_API_KEY_ABSENT');

    const subject = texte(body.subject, 200);
    const content = texte(body.content, 20_000);
    if (!subject) throw new Error('OBJET_REQUIS');
    if (!content) throw new Error('MESSAGE_REQUIS');
    const attachments = piecesJointes(body.attachments);

    const recipient = await adresseDestinataire(workspaceId, body);
    const requestId = /^[0-9a-f-]{36}$/i.test(texte(body.request_id, 36))
      ? texte(body.request_id, 36)
      : crypto.randomUUID();
    const inReplyTo = texte(body.in_reply_to, 500) || null;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `crm-${workspaceId}-${requestId}`,
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [recipient.email],
        reply_to: senderEmail,
        subject,
        text: content,
        html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.55;color:#101318">${echapperHtml(content)}</div>`,
        ...(attachments.length ? {
          attachments: attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.contentBase64,
            content_type: attachment.contentType,
          })),
        } : {}),
        ...(inReplyTo ? { headers: { 'In-Reply-To': inReplyTo } } : {}),
      }),
    });
    const resendPayload = await resendResponse.json().catch(() => ({})) as { id?: string; message?: string };
    if (!resendResponse.ok || !resendPayload.id) {
      throw new Error(`RESEND_HTTP_${resendResponse.status}: ${resendPayload.message ?? 'envoi refuse'}`);
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
        content,
        provider: 'resend-ionos',
        external_id: resendPayload.id,
        sender_email: senderEmail,
        recipient_email: recipient.email,
        email_in_reply_to: inReplyTo,
        email_attachments: attachments.map((attachment, index) => ({
          id: `outbound-${resendPayload.id}-${index + 1}`,
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
      last_error: null,
    }).eq('id', connection.id);

    return json({ success: true, communication });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (connectionId) {
      const integrationFailure = message.startsWith('RESEND_')
        || message === 'RESEND_API_KEY_ABSENT'
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
