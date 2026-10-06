import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { ImapFlow } from 'npm:imapflow@2.0.6';
import PostalMime from 'npm:postal-mime@3.0.0';
import {
  storeInboundEmail,
  type StoredInboundAttachment,
} from '../_shared/inbound-email.ts';
import {
  IONOS_IMAP_HOST,
  IONOS_IMAP_PORT,
  readIonosPassword,
} from '../_shared/ionos-email.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const PROVIDER = 'ionos-imap';
const MAILBOX = 'INBOX';
const MAX_MESSAGES_PER_SYNC = 8;
const MAX_MESSAGE_BYTES = 30 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_BYTES = 30 * 1024 * 1024;
const MAX_HTML_BYTES = 500_000;

type IonosConnection = {
  id: string;
  workspace_id: string;
  settings: Record<string, unknown> | null;
};

type ImportedEmail = {
  id: string;
  email_html: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function emailValide(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function nombre(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function htmlVersTexte(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extraireAdresse(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = value as { address?: unknown; group?: unknown };
  if (typeof candidate.address === 'string') return candidate.address.trim().toLowerCase();
  if (Array.isArray(candidate.group)) {
    for (const member of candidate.group) {
      const address = extraireAdresse(member);
      if (address) return address;
    }
  }
  return '';
}

function nomFichier(value: unknown, index: number): string {
  const raw = typeof value === 'string' ? value.trim().slice(0, 180) : '';
  const cleaned = [...raw]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/[\\/]/g, '-')
    .trim();
  return cleaned || `piece-jointe-${index + 1}`;
}

function cheminFichier(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150) || 'piece-jointe';
}

function bytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function automationAuthorized(req: Request): boolean {
  const provided = req.headers.get('apikey') ?? '';
  const configured = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  try {
    const expected = (JSON.parse(configured) as Record<string, string>).automations ?? '';
    if (!provided || !expected || provided.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < provided.length; index += 1) {
      difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
    }
    return difference === 0;
  } catch {
    return false;
  }
}

async function requireAdmin(req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHORIZED');
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('FORBIDDEN');
  if (!['admin', 'manager'].includes(profile.role)) throw new Error('FORBIDDEN');
  return profile.workspace_id as string;
}

async function stockerPiecesJointes(
  workspaceId: string,
  uidValidity: string,
  uid: number,
  attachments: unknown[],
): Promise<StoredInboundAttachment[]> {
  const stored: StoredInboundAttachment[] = [];
  let total = 0;

  for (const [index, value] of attachments.slice(0, 20).entries()) {
    if (!value || typeof value !== 'object') continue;
    const attachment = value as Record<string, unknown>;
    const content = bytes(attachment.content);
    if (!content || content.byteLength <= 0 || content.byteLength > MAX_ATTACHMENT_BYTES) continue;
    if (total + content.byteLength > MAX_ATTACHMENTS_TOTAL_BYTES) break;

    const id = `${uid}-${index + 1}`;
    const filename = nomFichier(attachment.filename, index);
    const contentType = typeof attachment.mimeType === 'string'
      ? attachment.mimeType.split(';', 1)[0].trim().toLowerCase().slice(0, 150)
      : 'application/octet-stream';
    const storagePath = `${workspaceId}/${uidValidity}/${uid}/${id}-${cheminFichier(filename)}`;
    const { error } = await admin.storage.from('email-attachments').upload(storagePath, content, {
      contentType,
      upsert: true,
      cacheControl: '0',
    });
    if (error) throw new Error(`STOCKAGE_PIECE_JOINTE: ${error.message}`);

    total += content.byteLength;
    stored.push({
      id,
      filename,
      content_type: contentType,
      size: content.byteLength,
      storage_path: storagePath,
    });
  }

  return stored;
}

async function emailImporte(
  workspaceId: string,
  externalId: string,
): Promise<ImportedEmail | null> {
  const { data, error } = await admin
    .from('communications')
    .select('id, email_html')
    .eq('workspace_id', workspaceId)
    .eq('provider', PROVIDER)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ImportedEmail | null;
}

async function uidsSansHtml(
  workspaceId: string,
  uidValidity: string,
): Promise<number[]> {
  const { data, error } = await admin
    .from('communications')
    .select('external_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', PROVIDER)
    .is('email_html', null)
    .not('external_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_MESSAGES_PER_SYNC * 4);
  if (error) throw new Error(error.message);

  const prefix = `${MAILBOX}:${uidValidity}:`;
  return (data ?? [])
    .map((row) => typeof row.external_id === 'string' && row.external_id.startsWith(prefix)
      ? Number(row.external_id.slice(prefix.length))
      : 0)
    .filter((uid) => Number.isSafeInteger(uid) && uid > 0);
}

async function syncWorkspace(connection: IonosConnection) {
  const settings = (connection.settings ?? {}) as Record<string, unknown>;
  const emailAddress = typeof settings.email_address === 'string'
    ? settings.email_address.trim().toLowerCase()
    : '';
  if (!emailValide(emailAddress)) throw new Error('BOITE_IONOS_NON_CONFIGUREE');
  const password = await readIonosPassword(admin, connection.workspace_id);
  if (!password) throw new Error('MOT_DE_PASSE_IONOS_ABSENT');

  const client = new ImapFlow({
    host: IONOS_IMAP_HOST,
    port: IONOS_IMAP_PORT,
    secure: true,
    auth: { user: emailAddress, pass: password },
    logger: false,
    disableAutoIdle: true,
    disableCompression: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
    tls: { minVersion: 'TLSv1.2', servername: IONOS_IMAP_HOST },
  });
  client.on('error', (error) => console.error('IONOS IMAP:', error.message));

  let lock: { release: () => void } | null = null;
  try {
    await client.connect();
    lock = await client.getMailboxLock(MAILBOX, { readOnly: true });
    const mailbox = client.mailbox;
    if (!mailbox) throw new Error('IONOS_IMAP_BOITE_INTROUVABLE');
    const uidValidity = String(mailbox.uidValidity ?? '0');

    let lastUid = nombre(settings.imap_last_uid);
    let backfillBeforeUid = nombre(settings.imap_backfill_before_uid);
    let cursorWasReady = lastUid > 0;
    if (typeof settings.imap_uidvalidity === 'string' && settings.imap_uidvalidity !== uidValidity) {
      lastUid = 0;
      backfillBeforeUid = 0;
      cursorWasReady = false;
    }

    const searchResult = await client.search({ all: true }, { uid: true });
    const allUids = (Array.isArray(searchResult) ? searchResult : [])
      .filter((uid): uid is number => Number.isSafeInteger(uid) && uid > 0)
      .sort((a, b) => a - b);

    const newCandidates = lastUid > 0
      ? allUids.filter((uid) => uid > lastUid).slice(0, MAX_MESSAGES_PER_SYNC)
      : allUids.slice(-MAX_MESSAGES_PER_SYNC);
    const selected = [...newCandidates];
    if (lastUid === 0 && newCandidates.length > 0) {
      lastUid = Math.max(...newCandidates);
      backfillBeforeUid = Math.min(...newCandidates);
    } else if (newCandidates.length > 0) {
      lastUid = Math.max(lastUid, ...newCandidates);
    }

    let remaining = MAX_MESSAGES_PER_SYNC - selected.length;
    if (remaining > 0) {
      const missingHtml = (await uidsSansHtml(connection.workspace_id, uidValidity))
        .filter((uid) => allUids.includes(uid) && !selected.includes(uid))
        .slice(0, remaining);
      selected.push(...missingHtml);
      remaining = MAX_MESSAGES_PER_SYNC - selected.length;
    }
    if (remaining > 0 && backfillBeforeUid > 1) {
      const older = allUids
        .filter((uid) => uid < backfillBeforeUid && !selected.includes(uid))
        .slice(-remaining);
      selected.push(...older);
      if (older.length > 0) backfillBeforeUid = Math.min(...older);
    }

    let imported = 0;
    let enriched = 0;
    let duplicates = 0;
    let skipped = 0;
    for (const uid of selected.sort((a, b) => a - b)) {
      const externalId = `${MAILBOX}:${uidValidity}:${uid}`;
      const existingEmail = await emailImporte(connection.workspace_id, externalId);
      if (existingEmail && existingEmail.email_html !== null) {
        duplicates += 1;
        continue;
      }

      const metadata = await client.fetchOne(uid, { uid: true, size: true }, { uid: true });
      if (!metadata || (typeof metadata.size === 'number' && metadata.size > MAX_MESSAGE_BYTES)) {
        skipped += 1;
        continue;
      }
      const message = await client.fetchOne(
        uid,
        { uid: true, source: true, internalDate: true },
        { uid: true },
      );
      if (!message || !message.source) throw new Error(`IONOS_IMAP_SOURCE_ABSENTE:${uid}`);

      const parsed = await PostalMime.parse(message.source);
      const sender = extraireAdresse(parsed.from);
      if (!emailValide(sender)) {
        skipped += 1;
        continue;
      }
      const subject = (parsed.subject?.trim() || '(Sans objet)').slice(0, 200);
      const content = (parsed.text?.trim() || (parsed.html ? htmlVersTexte(parsed.html) : '')).slice(0, 50_000);
      const html = typeof parsed.html === 'string' && parsed.html.trim()
        ? parsed.html.trim().slice(0, MAX_HTML_BYTES)
        : null;

      if (existingEmail) {
        const { error: enrichError } = await admin
          .from('communications')
          .update({ email_html: html ?? '' })
          .eq('id', existingEmail.id)
          .eq('workspace_id', connection.workspace_id);
        if (enrichError) throw new Error(enrichError.message);
        enriched += 1;
        continue;
      }

      const attachments = await stockerPiecesJointes(
        connection.workspace_id,
        uidValidity,
        uid,
        Array.isArray(parsed.attachments) ? parsed.attachments : [],
      );
      const dateCandidate = parsed.date ? new Date(parsed.date) : message.internalDate;
      const createdAt = dateCandidate instanceof Date && Number.isFinite(dateCandidate.getTime())
        ? dateCandidate.toISOString()
        : new Date().toISOString();

      const result = await storeInboundEmail(admin, {
        id: crypto.randomUUID(),
        workspaceId: connection.workspace_id,
        connectionId: connection.id,
        provider: PROVIDER,
        externalId,
        sender,
        recipient: emailAddress,
        subject,
        content,
        html,
        messageId: typeof parsed.messageId === 'string' ? parsed.messageId.slice(0, 500) : null,
        attachments,
        createdAt,
        notify: cursorWasReady && newCandidates.includes(uid),
      });
      if (result === 'inserted') imported += 1;
      else duplicates += 1;
    }

    const nextSettings = {
      ...settings,
      transport: 'ionos-imap-smtp',
      imap_uidvalidity: uidValidity,
      imap_last_uid: lastUid,
      imap_backfill_before_uid: backfillBeforeUid,
      imap_backfill_complete: backfillBeforeUid <= 1 || allUids.length === 0,
      last_sync_at: new Date().toISOString(),
    };
    const { error: updateError } = await admin.from('integration_connections').update({
      status: 'connected',
      settings: nextSettings,
      last_tested_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', connection.id);
    if (updateError) throw new Error(updateError.message);

    return { imported, enriched, duplicates, skipped, remaining_history: backfillBeforeUid > 1 };
  } finally {
    lock?.release();
    if (client.usable) await client.logout().catch(() => client.close());
    else client.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const workspaceId = automationAuthorized(req) ? null : await requireAdmin(req);
    let query = admin
      .from('integration_connections')
      .select('id, workspace_id, settings')
      .eq('provider', 'ionos');
    if (workspaceId) query = query.eq('workspace_id', workspaceId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const results = [];
    for (const connection of (data ?? []) as IonosConnection[]) {
      try {
        results.push({
          workspace_id: connection.workspace_id,
          success: true,
          ...(await syncWorkspace(connection)),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await admin.from('integration_connections').update({
          status: 'error',
          last_error: message,
          last_tested_at: new Date().toISOString(),
        }).eq('id', connection.id);
        results.push({ workspace_id: connection.workspace_id, success: false, error: message });
      }
    }

    const failed = results.filter((result) => !result.success);
    return json({
      success: failed.length === 0,
      results,
      error: failed.length ? failed.map((result) => result.error).join(' | ') : null,
    }, failed.length ? 400 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return json({ success: false, error: message }, status);
  }
});
