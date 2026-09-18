import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type StoredAttachment = {
  id?: unknown;
  filename?: unknown;
  content_type?: unknown;
};

type ResendAttachment = {
  id?: string;
  filename?: string;
  content_type?: string;
  download_url?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function texte(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nomFichier(value: unknown): string {
  const withoutControlCharacters = [...texte(value, 240)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  const cleaned = withoutControlCharacters
    .replace(/[\\/]/g, '-')
    .trim();
  return cleaned || 'piece-jointe';
}

function typeContenu(value: unknown): string {
  const candidate = texte(value, 150).split(';', 1)[0].toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(candidate)
    ? candidate
    : '';
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
  return { workspaceId: profile.workspace_id as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const { workspaceId } = await utilisateur(req);
    const body = await req.json() as Record<string, unknown>;
    const communicationId = texte(body.communication_id, 80);
    const attachmentId = texte(body.attachment_id, 200);
    if (!communicationId || !attachmentId) throw new Error('PIECE_JOINTE_INVALIDE');

    const { data: communication, error: communicationError } = await admin
      .from('communications')
      .select('external_id, email_attachments')
      .eq('id', communicationId)
      .eq('workspace_id', workspaceId)
      .eq('provider', 'resend-ionos')
      .eq('type', 'email_inbound')
      .maybeSingle();
    if (communicationError) throw new Error(communicationError.message);
    if (!communication?.external_id) throw new Error('EMAIL_INTROUVABLE');

    const attachments = Array.isArray(communication.email_attachments)
      ? communication.email_attachments as StoredAttachment[]
      : [];
    const storedAttachment = attachments.find((attachment) => attachment.id === attachmentId);
    if (!storedAttachment) throw new Error('PIECE_JOINTE_INTROUVABLE');

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('RESEND_API_KEY_ABSENT');

    const metadataResponse = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(communication.external_id)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const metadata = await metadataResponse.json().catch(() => ({})) as ResendAttachment & { message?: string };
    if (!metadataResponse.ok || !metadata.download_url) {
      throw new Error(`RESEND_ATTACHMENT_HTTP_${metadataResponse.status}: ${metadata.message ?? 'piece jointe refusee'}`);
    }

    const downloadUrl = new URL(metadata.download_url);
    if (downloadUrl.protocol !== 'https:' || !downloadUrl.hostname.endsWith('.resend.com')) {
      throw new Error('RESEND_ATTACHMENT_URL_INVALIDE');
    }

    const fileResponse = await fetch(downloadUrl, { redirect: 'follow' });
    if (!fileResponse.ok || !fileResponse.body) {
      throw new Error(`RESEND_DOWNLOAD_HTTP_${fileResponse.status}`);
    }

    const filename = nomFichier(storedAttachment.filename ?? metadata.filename);
    const asciiFilename = filename.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/"/g, '');
    const contentType = typeContenu(storedAttachment.content_type ?? metadata.content_type)
      || typeContenu(fileResponse.headers.get('Content-Type'))
      || 'application/octet-stream';
    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const contentLength = fileResponse.headers.get('Content-Length');
    if (contentLength) headers['Content-Length'] = contentLength;

    return new Response(fileResponse.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED'
      ? 401
      : message === 'FORBIDDEN'
        ? 403
        : message.endsWith('INTROUVABLE')
          ? 404
          : message.startsWith('RESEND_')
            ? 502
            : 400;
    return json({ error: message }, status);
  }
});
