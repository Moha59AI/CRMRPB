import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);
const bucket = 'client-documents';
const maxBytes = 12 * 1024 * 1024;
const allowedMime = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

async function notifyDocumentDeposit(itemId: string, workspaceId: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const forcedRecipient = Deno.env.get('DOCUMENT_NOTIFICATION_EMAIL')?.trim();
  const from = Deno.env.get('DOCUMENT_NOTIFICATION_FROM')?.trim()
    || 'Relais Pare-Brise <notifications@relaisparebrise.fr>';

  const { data: workspace } = await admin
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single();
  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  const settingsRecipient = typeof settings.email === 'string' ? settings.email.trim() : '';
  const recipient = forcedRecipient || settingsRecipient || 'contact@relaisparebrise.fr';

  if (!apiKey) {
    await admin.from('client_document_items').update({
      notification_email_error: 'RESEND_API_KEY absent',
    }).eq('id', itemId);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: 'Nouveau document client reçu',
      html: `<div style="font-family:Arial,sans-serif;color:#101318;line-height:1.5">
        <h2 style="margin:0 0 16px">Une nouvelle pièce vient d’être déposée</h2>
        <p>Ouvrez le CRM pour consulter le document et retrouver le dossier concerné.</p>
        <p style="margin-top:20px"><a href="https://crm.relaisparebrise.fr/today" style="color:#16a34a;font-weight:600">Ouvrir le CRM</a></p>
      </div>`,
    }),
  });

  if (!response.ok) {
    await admin.from('client_document_items').update({
      notification_email_error: `Resend HTTP ${response.status}`,
    }).eq('id', itemId);
    return;
  }

  await admin.from('client_document_items').update({
    notification_email_sent_at: new Date().toISOString(),
    notification_email_error: null,
  }).eq('id', itemId);
}

async function findRequest(token: string) {
  const tokenHash = await sha256(token);
  const { data, error } = await admin
    .from('client_document_requests')
    .select('id, workspace_id, lead_id, case_id, status, expires_at, submitted_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.status === 'revoked') return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await admin.from('client_document_requests').update({ status: 'expired' }).eq('id', data.id);
    return null;
  }
  return data;
}

async function session(token: string) {
  const request = await findRequest(token);
  if (!request) return json({ error: 'Ce lien est invalide ou a expiré.' }, 404);

  const [{ data: lead, error: leadError }, { data: items, error: itemsError }] = await Promise.all([
    admin.from('leads').select('first_name, last_name, offer').eq('id', request.lead_id).single(),
    admin.from('client_document_items')
      .select('id, document_type, label, required, status, original_name, mime_type, size_bytes, storage_path, uploaded_at, rejection_reason')
      .eq('request_id', request.id)
      .order('created_at'),
  ]);
  if (leadError) throw leadError;
  if (itemsError) throw itemsError;

  const enriched = await Promise.all((items ?? []).map(async (item) => {
    let preview_url: string | null = null;
    if (item.storage_path && ['uploaded', 'validated'].includes(item.status)) {
      const { data } = await admin.storage.from(bucket).createSignedUrl(item.storage_path, 300);
      preview_url = data?.signedUrl ?? null;
    }
    return {
      id: item.id,
      document_type: item.document_type,
      label: item.label,
      required: item.required,
      status: item.status,
      original_name: item.original_name,
      mime_type: item.mime_type,
      size_bytes: item.size_bytes,
      uploaded_at: item.uploaded_at,
      rejection_reason: item.rejection_reason,
      preview_url,
    };
  }));

  await admin.from('client_document_requests')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', request.id);

  return json({
    client_first_name: lead.first_name,
    selected_offer: lead.offer,
    request_status: request.status,
    expires_at: request.expires_at,
    submitted_at: request.submitted_at,
    items: enriched,
  });
}

async function prepareUpload(body: Record<string, unknown>, token: string) {
  const request = await findRequest(token);
  if (!request) return json({ error: 'Ce lien est invalide ou a expiré.' }, 404);

  const itemId = typeof body.item_id === 'string' ? body.item_id : '';
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.toLowerCase() : '';
  const sizeBytes = typeof body.size_bytes === 'number' ? body.size_bytes : 0;
  const originalName = typeof body.file_name === 'string' ? body.file_name.trim().slice(0, 180) : '';
  const extension = allowedMime.get(mimeType);
  if (!itemId || !originalName || !extension) {
    return json({ error: 'Format non accepté. Utilisez un PDF, JPG, PNG, WEBP ou HEIC.' }, 400);
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    return json({ error: 'Le fichier doit faire moins de 12 Mo.' }, 400);
  }

  const { data: item, error: itemError } = await admin
    .from('client_document_items')
    .select('id')
    .eq('id', itemId)
    .eq('request_id', request.id)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return json({ error: 'Document introuvable.' }, 404);

  const path = `${request.workspace_id}/${request.id}/${item.id}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error('Impossible de préparer le dépôt.');

  return json({ path, upload_token: data.token });
}

async function completeUpload(body: Record<string, unknown>, token: string) {
  const request = await findRequest(token);
  if (!request) return json({ error: 'Ce lien est invalide ou a expiré.' }, 404);

  const itemId = typeof body.item_id === 'string' ? body.item_id : '';
  const path = typeof body.path === 'string' ? body.path : '';
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.toLowerCase() : '';
  const sizeBytes = typeof body.size_bytes === 'number' ? body.size_bytes : 0;
  const originalName = typeof body.file_name === 'string' ? body.file_name.trim().slice(0, 180) : '';
  const expectedPrefix = `${request.workspace_id}/${request.id}/${itemId}/`;
  if (!itemId || !path.startsWith(expectedPrefix) || !allowedMime.has(mimeType) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    return json({ error: 'Dépôt invalide.' }, 400);
  }

  const { data: item, error: itemError } = await admin
    .from('client_document_items')
    .select('id, storage_path')
    .eq('id', itemId)
    .eq('request_id', request.id)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return json({ error: 'Document introuvable.' }, 404);

  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const folder = path.slice(0, path.lastIndexOf('/'));
  const { data: objects, error: listError } = await admin.storage.from(bucket).list(folder, {
    limit: 2,
    search: fileName,
  });
  if (listError) throw listError;
  const storedObject = objects?.find((object) => object.name === fileName);
  if (!storedObject) {
    return json({ error: 'Le fichier n’a pas été reçu. Réessayez.' }, 409);
  }
  const storedSize = Number(storedObject.metadata?.size ?? sizeBytes);
  if (!Number.isFinite(storedSize) || storedSize <= 0 || storedSize > maxBytes) {
    await admin.storage.from(bucket).remove([path]);
    return json({ error: 'Le fichier reçu dépasse la limite de 12 Mo.' }, 400);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin.from('client_document_items').update({
    status: 'uploaded', storage_path: path, original_name: originalName,
    mime_type: mimeType, size_bytes: storedSize, uploaded_at: now,
    validated_at: null, rejection_reason: null,
    notification_email_sent_at: null, notification_email_error: null,
  }).eq('id', itemId).eq('request_id', request.id);
  if (updateError) throw updateError;

  if (item.storage_path && item.storage_path !== path) {
    await admin.storage.from(bucket).remove([item.storage_path]);
  }

  await notifyDocumentDeposit(item.id, request.workspace_id);

  const { data: remaining, error: remainingError } = await admin
    .from('client_document_items')
    .select('id')
    .eq('request_id', request.id)
    .eq('required', true)
    .not('status', 'in', '(uploaded,validated)');
  if (remainingError) throw remainingError;

  const complete = (remaining ?? []).length === 0;
  await admin.from('client_document_requests').update({
    status: complete ? 'complete' : 'open',
    submitted_at: complete ? request.submitted_at ?? now : null,
  }).eq('id', request.id);

  await admin.from('leads').update({
    status: complete ? 'documents_received' : 'documents_requested',
  }).eq('id', request.lead_id).eq('workspace_id', request.workspace_id);

  if (complete && request.status !== 'complete') {
    const { data: recipients, error: recipientsError } = await admin
      .from('profiles')
      .select('id')
      .eq('workspace_id', request.workspace_id)
      .in('role', ['admin', 'manager', 'advisor']);
    if (recipientsError) throw recipientsError;

    const notificationRows = (recipients ?? []).map((recipient) => ({
        workspace_id: request.workspace_id,
        user_id: recipient.id,
        title: 'Documents client reçus',
        body: 'Toutes les pièces obligatoires ont été déposées.',
        type: 'documents_received',
        link: `/interventions/${request.lead_id}`,
      }));
    if (notificationRows.length > 0) {
      const { error: notificationError } = await admin
        .from('notifications')
        .insert(notificationRows);
      if (notificationError) throw notificationError;
    }
  }

  return json({ success: true, complete });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    if (!validToken(body.token)) return json({ error: 'Lien invalide.' }, 400);
    const action = typeof body.action === 'string' ? body.action : 'session';
    if (action === 'session') return await session(body.token);
    if (action === 'prepare_upload') return await prepareUpload(body, body.token);
    if (action === 'complete_upload') return await completeUpload(body, body.token);
    return json({ error: 'Action inconnue.' }, 400);
  } catch (error) {
    console.error('client-documents', error);
    return json({ error: 'Le service est momentanément indisponible.' }, 500);
  }
});
