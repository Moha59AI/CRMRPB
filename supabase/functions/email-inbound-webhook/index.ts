import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bytesBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function egaux(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifierSignature(req: Request, payload: string): Promise<boolean> {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
  const id = req.headers.get('svix-id') ?? '';
  const timestamp = req.headers.get('svix-timestamp') ?? '';
  const signatures = req.headers.get('svix-signature') ?? '';
  if (!secret || !id || !timestamp || !signatures) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;

  const secretBytes = bytesBase64(secret.replace(/^whsec_/, ''));
  const key = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${payload}`);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));

  return signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    try {
      return egaux(expected, bytesBase64(signature));
    } catch {
      return false;
    }
  });
}

function extraireAdresse(value: unknown): string {
  if (typeof value !== 'string') return '';
  const entreChevrons = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (entreChevrons?.[1] ?? value).trim().toLowerCase();
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

async function traiterStatut(event: Record<string, unknown>): Promise<void> {
  const type = typeof event.type === 'string' ? event.type : '';
  if (!['email.delivered', 'email.failed', 'email.bounced'].includes(type)) return;
  const data = (event.data ?? {}) as Record<string, unknown>;
  const externalId = typeof data.email_id === 'string' ? data.email_id : '';
  if (!externalId) return;

  await admin.from('communications').update({
    status: type === 'email.delivered' ? 'delivered' : 'failed',
    delivered_at: type === 'email.delivered' ? new Date().toISOString() : null,
  }).eq('provider', 'resend-ionos').eq('external_id', externalId);
}

async function traiterEmailRecu(event: Record<string, unknown>): Promise<void> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const emailId = typeof data.email_id === 'string' ? data.email_id : '';
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!emailId || !apiKey) throw new Error('CONFIGURATION_RESEND_INCOMPLETE');

  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const email = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`RESEND_RECEIVING_HTTP_${response.status}`);

  const destinations = [
    ...(Array.isArray(data.to) ? data.to : []),
    ...(Array.isArray(email.to) ? email.to : []),
  ].map(extraireAdresse).filter(Boolean);

  const { data: connections, error: connectionError } = await admin
    .from('integration_connections')
    .select('id, workspace_id, settings')
    .eq('provider', 'ionos');
  if (connectionError) throw new Error(connectionError.message);

  const connection = (connections ?? []).find((candidate) => {
    const settings = (candidate.settings ?? {}) as Record<string, unknown>;
    const inbound = extraireAdresse(settings.inbound_address);
    return inbound && destinations.includes(inbound);
  });
  if (!connection) {
    console.warn('Email Resend ignore : aucune adresse de transfert IONOS correspondante', destinations);
    return;
  }

  const workspaceId = connection.workspace_id as string;
  const settings = (connection.settings ?? {}) as Record<string, unknown>;
  const sender = extraireAdresse(email.from ?? data.from);
  if (!sender) {
    console.warn('Email Resend ignore : expéditeur absent', emailId);
    return;
  }
  const recipient = extraireAdresse(settings.email_address);
  const subject = typeof email.subject === 'string' ? email.subject.slice(0, 200) : '(Sans objet)';
  const textBody = typeof email.text === 'string' && email.text.trim()
    ? email.text.trim()
    : typeof email.html === 'string' ? htmlVersTexte(email.html) : '';
  const attachments = Array.isArray(email.attachments)
    ? email.attachments.slice(0, 30).map((item) => {
        const attachment = item as Record<string, unknown>;
        return {
          id: String(attachment.id ?? ''),
          filename: String(attachment.filename ?? 'piece-jointe').slice(0, 180),
          content_type: typeof attachment.content_type === 'string' ? attachment.content_type : null,
          size: typeof attachment.size === 'number' ? attachment.size : null,
        };
      })
    : [];

  const [{ data: contact, error: contactError }, { data: lead, error: leadError }] = await Promise.all([
    admin.from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .ilike('email', sender)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('leads')
      .select('id, contact_id')
      .eq('workspace_id', workspaceId)
      .ilike('email', sender)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (contactError) throw new Error(contactError.message);
  if (leadError) throw new Error(leadError.message);

  // Si un lead récent existe, son contact fait autorité. Cela évite de lier
  // le même email à un ancien doublon de contact trouvé indépendamment.
  const contactId = lead?.contact_id ?? contact?.id ?? null;
  const leadId = lead?.id ?? null;
  const { error: insertError } = await admin.from('communications').insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    lead_id: leadId,
    type: 'email_inbound',
    direction: 'inbound',
    status: 'received',
    subject,
    content: textBody.slice(0, 50_000) || null,
    provider: 'resend-ionos',
    external_id: emailId,
    sender_email: sender || null,
    recipient_email: recipient || null,
    email_message_id: typeof email.message_id === 'string' ? email.message_id.slice(0, 500) : null,
    email_attachments: attachments,
    created_at: typeof email.created_at === 'string' ? email.created_at : new Date().toISOString(),
  });
  if (insertError?.code === '23505') return;
  if (insertError) throw new Error(insertError.message);

  const { data: recipients, error: recipientsError } = await admin
    .from('profiles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('role', ['admin', 'manager', 'advisor']);
  if (recipientsError) throw new Error(recipientsError.message);

  const link = leadId ? `/interventions/${leadId}` : contactId ? `/clients/${contactId}` : '/communications';
  if ((recipients ?? []).length > 0) {
    const { error: notificationError } = await admin.from('notifications').insert(
      (recipients ?? []).map((profile) => ({
        workspace_id: workspaceId,
        user_id: profile.id,
        title: 'Nouvel email reçu',
        body: `${sender} — ${subject}`,
        type: 'email_received',
        link,
        dedup_key: `email-recu-${emailId}`,
      })),
    );
    if (notificationError) throw new Error(notificationError.message);
  }

  await admin.from('integration_connections').update({
    status: 'connected',
    last_success_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', connection.id);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const payload = await req.text();

  try {
    if (!await verifierSignature(req, payload)) return json({ error: 'Signature invalide' }, 401);
    const event = JSON.parse(payload) as Record<string, unknown>;
    if (event.type === 'email.received') await traiterEmailRecu(event);
    else await traiterStatut(event);
    return json({ received: true });
  } catch (error) {
    console.error('email-inbound-webhook', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
