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

const defaultPortalSettings = {
  page_title: 'Ajoutez les pièces de votre dossier',
  page_intro: 'Prenez une photo nette ou choisissez un PDF. Vous pouvez remplacer un document tant que nécessaire.',
  completion_title: 'Toutes les pièces nécessaires sont bien reçues',
  completion_message: 'Votre dossier est transmis à l’équipe Relais Pare-Brise. Vous n’avez rien d’autre à faire pour le moment : nous vérifions les documents et nous vous contactons pour la suite ou si une pièce doit être remplacée.',
  show_gift: true,
};

const defaultDocumentRules = [
  { document_type: 'registration', enabled: true },
  { document_type: 'insurance_cert', enabled: true },
  { document_type: 'technical_inspection', enabled: true },
  { document_type: 'other', enabled: true },
];

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
  return typeof value === 'string'
    && /^(?:[0-9a-f]{64}|[A-Za-z0-9_-]{24})$/.test(value);
}

function visibleDocumentTypes(value: unknown): Set<string> {
  const rawRules = Array.isArray(value) ? value : defaultDocumentRules;
  const types = rawRules.flatMap((raw): string[] => {
    if (!raw || typeof raw !== 'object') return [];
    const rule = raw as Record<string, unknown>;
    return rule.enabled === true && typeof rule.document_type === 'string'
      ? [rule.document_type]
      : [];
  });
  return new Set(types.length > 0 ? types : defaultDocumentRules.map((rule) => rule.document_type));
}

/** Echappe ce qui vient du client : un nom peut contenir &, < ou >. */
function texteHtml(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function notifyDocumentDeposit(
  itemId: string,
  workspaceId: string,
  leadId: string | null,
): Promise<void> {
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

  // Le mail disait « une nouvelle pièce vient d'être déposée » sans dire par
  // qui ni laquelle, et renvoyait vers l'accueil : il fallait chercher le
  // dossier a la main. Il porte desormais ce qu'il faut pour agir sans
  // ouvrir le CRM pour rien.
  const { data: piece } = await admin
    .from('client_document_items')
    .select('label, document_type, original_name')
    .eq('id', itemId)
    .maybeSingle();

  const { data: lead } = leadId
    ? await admin
      .from('leads')
      .select('first_name, last_name, vehicle_make, vehicle_model, vehicle_registration')
      .eq('id', leadId)
      .maybeSingle()
    : { data: null };

  const partie = (valeur: unknown): string =>
    (typeof valeur === 'string' ? valeur.trim() : '');

  const nomClient = [partie(lead?.first_name), partie(lead?.last_name)]
    .filter(Boolean).join(' ') || 'Client sans nom';
  const vehicule = [
    [partie(lead?.vehicle_make), partie(lead?.vehicle_model)].filter(Boolean).join(' '),
    partie(lead?.vehicle_registration),
  ].filter(Boolean).join(' · ');
  const nomPiece = partie(piece?.label) || partie(piece?.document_type) || 'Document';
  const lienDossier = leadId
    ? `https://crm.relaisparebrise.fr/interventions/${leadId}`
    : 'https://crm.relaisparebrise.fr/today';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: `Document reçu — ${nomClient}`,
      html: `<div style="font-family:Arial,sans-serif;color:#101318;line-height:1.5">
        <h2 style="margin:0 0 4px">${texteHtml(nomClient)}</h2>
        <p style="margin:0 0 16px;color:#646464">a déposé : <strong>${texteHtml(nomPiece)}</strong></p>
        ${vehicule ? `<p style="margin:0 0 16px;color:#646464">${texteHtml(vehicule)}</p>` : ''}
        <p style="margin-top:20px"><a href="${lienDossier}" style="color:#16a34a;font-weight:600">Ouvrir le dossier</a></p>
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

  const [
    { data: lead, error: leadError },
    { data: items, error: itemsError },
    { data: savedSettings, error: settingsError },
  ] = await Promise.all([
    admin.from('leads').select('first_name, last_name, offer').eq('id', request.lead_id).single(),
    admin.from('client_document_items')
      .select('id, document_type, label, required, status, original_name, mime_type, size_bytes, storage_path, uploaded_at, rejection_reason')
      .eq('request_id', request.id)
      .order('created_at'),
    admin.from('client_document_portal_settings')
      .select('page_title, page_intro, completion_title, completion_message, show_gift, document_rules')
      .eq('workspace_id', request.workspace_id)
      .maybeSingle(),
  ]);
  if (leadError) throw leadError;
  if (itemsError) throw itemsError;
  if (settingsError) console.warn('Reglages du portail indisponibles, valeurs par defaut utilisees', settingsError.message);

  const visibleTypes = visibleDocumentTypes(savedSettings?.document_rules);
  const enriched = await Promise.all((items ?? []).filter((item) => (
    visibleTypes.has(item.document_type)
  )).map(async (item) => {
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
    page_title: savedSettings?.page_title ?? defaultPortalSettings.page_title,
    page_intro: savedSettings?.page_intro ?? defaultPortalSettings.page_intro,
    completion_title: savedSettings?.completion_title ?? defaultPortalSettings.completion_title,
    completion_message: savedSettings?.completion_message ?? defaultPortalSettings.completion_message,
    show_gift: savedSettings?.show_gift ?? defaultPortalSettings.show_gift,
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

  // Le document est deja rattache a la fiche et son statut est consolide en
  // base. L'email est un confort : une panne Resend ne doit jamais faire
  // croire au client que son fichier a ete perdu ni empecher le CRM de le voir.
  try {
    await notifyDocumentDeposit(item.id, request.workspace_id, request.lead_id);
  } catch (notificationError) {
    const message = notificationError instanceof Error
      ? notificationError.message
      : 'Erreur inconnue';
    console.error('client-documents notification email', notificationError);
    await admin.from('client_document_items').update({
      notification_email_error: `Email indisponible : ${message}`.slice(0, 500),
    }).eq('id', item.id);
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
