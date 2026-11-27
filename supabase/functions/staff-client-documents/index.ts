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

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return [...value.trim().slice(0, max)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
}

async function staffContext(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/iu, '');
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

async function documentTarget(workspaceId: string, requestId: string, itemId: string) {
  const { data: item, error: itemError } = await admin
    .from('client_document_items')
    .select('id, request_id, workspace_id, document_type')
    .eq('id', itemId)
    .eq('request_id', requestId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new Error('DOCUMENT_NOT_FOUND');

  const { data: request, error: requestError } = await admin
    .from('client_document_requests')
    .select('id, lead_id, workspace_id, status, submitted_at')
    .eq('id', requestId)
    .eq('workspace_id', workspaceId)
    .in('status', ['open', 'complete'])
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error('REQUEST_NOT_FOUND');
  return { item, request };
}

function uploadInput(body: Record<string, unknown>) {
  const requestId = text(body.request_id, 80);
  const itemId = text(body.item_id, 80);
  const originalName = text(body.file_name, 180);
  const mimeType = text(body.mime_type, 150).toLowerCase();
  const sizeBytes = typeof body.size_bytes === 'number' ? body.size_bytes : 0;
  const extension = allowedMime.get(mimeType);
  if (!requestId || !itemId || !originalName || !extension) throw new Error('INVALID_FILE');
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) throw new Error('INVALID_SIZE');
  return { requestId, itemId, originalName, mimeType, sizeBytes, extension };
}

async function prepareUpload(body: Record<string, unknown>, workspaceId: string) {
  const input = uploadInput(body);
  await documentTarget(workspaceId, input.requestId, input.itemId);
  const path = `${workspaceId}/${input.requestId}/${input.itemId}/${crypto.randomUUID()}.${input.extension}`;
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? 'UPLOAD_PREPARATION_FAILED');
  return json({ path, upload_token: data.token });
}

async function completeUpload(
  body: Record<string, unknown>,
  context: { userId: string; workspaceId: string },
) {
  const input = uploadInput(body);
  const path = text(body.path, 1_000);
  const expectedPrefix = `${context.workspaceId}/${input.requestId}/${input.itemId}/`;
  if (!path.startsWith(expectedPrefix)) throw new Error('INVALID_PATH');

  const { item, request } = await documentTarget(
    context.workspaceId,
    input.requestId,
    input.itemId,
  );

  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const folder = path.slice(0, path.lastIndexOf('/'));
  const { data: objects, error: listError } = await admin.storage.from(bucket).list(folder, {
    limit: 2,
    search: fileName,
  });
  if (listError) throw new Error(listError.message);
  const storedObject = objects?.find((object) => object.name === fileName);
  if (!storedObject) throw new Error('FILE_NOT_RECEIVED');
  const storedSize = Number(storedObject.metadata?.size ?? input.sizeBytes);
  if (!Number.isFinite(storedSize) || storedSize <= 0 || storedSize > maxBytes) {
    await admin.storage.from(bucket).remove([path]);
    throw new Error('INVALID_SIZE');
  }

  const now = new Date().toISOString();
  const { error: fileError } = await admin.from('client_document_files').upsert({
    workspace_id: context.workspaceId,
    request_id: request.id,
    item_id: item.id,
    storage_path: path,
    original_name: input.originalName,
    mime_type: input.mimeType,
    size_bytes: storedSize,
    uploaded_at: now,
  }, { onConflict: 'storage_path' });
  if (fileError) {
    await admin.storage.from(bucket).remove([path]);
    throw new Error(fileError.message);
  }

  const { error: itemError } = await admin.from('client_document_items').update({
    status: 'uploaded',
    storage_path: path,
    original_name: input.originalName,
    mime_type: input.mimeType,
    size_bytes: storedSize,
    uploaded_at: now,
    validated_at: null,
    rejection_reason: null,
    notification_email_error: null,
  }).eq('id', item.id).eq('request_id', request.id).eq('workspace_id', context.workspaceId);
  if (itemError) throw new Error(itemError.message);

  const { data: remaining, error: remainingError } = await admin
    .from('client_document_items')
    .select('id')
    .eq('request_id', request.id)
    .eq('required', true)
    .not('status', 'in', '(uploaded,validated)');
  if (remainingError) throw new Error(remainingError.message);

  const complete = (remaining ?? []).length === 0;
  const { error: requestUpdateError } = await admin.from('client_document_requests').update({
    status: complete ? 'complete' : 'open',
    submitted_at: complete ? request.submitted_at ?? now : null,
  }).eq('id', request.id).eq('workspace_id', context.workspaceId);
  if (requestUpdateError) throw new Error(requestUpdateError.message);

  const nextLeadStatus = complete ? 'documents_received' : 'documents_requested';
  const mutableLeadStatuses = complete
    ? [
      'new', 'to_call', 'calling', 'nrp', 'interested',
      'documents_requested', 'documents_received',
    ]
    : [
      'new', 'to_call', 'calling', 'nrp', 'interested',
      'documents_requested',
    ];
  const { error: leadError } = await admin.from('leads').update({
    status: nextLeadStatus,
    updated_at: now,
  })
    .eq('id', request.lead_id)
    .eq('workspace_id', context.workspaceId)
    .in('status', mutableLeadStatuses);
  if (leadError) throw new Error(leadError.message);

  const { error: activityError } = await admin.from('client_document_activity').insert({
    workspace_id: context.workspaceId,
    request_id: request.id,
    lead_id: request.lead_id,
    event_type: 'staff_document_uploaded',
    document_type: item.document_type,
    device_type: 'unknown',
  });
  if (activityError) console.warn('staff document activity', activityError.message);

  if (complete && !request.submitted_at) {
    const { error: completionError } = await admin.from('client_document_activity').insert({
      workspace_id: context.workspaceId,
      request_id: request.id,
      lead_id: request.lead_id,
      event_type: 'request_completed',
      device_type: 'unknown',
    });
    if (completionError) console.warn('staff request completion activity', completionError.message);
  }

  return json({ success: true, complete });
}

function knownError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  if (message === 'UNAUTHORIZED') return json({ error: 'Session expirée.' }, 401);
  if (message === 'FORBIDDEN') return json({ error: 'Vous n’êtes pas autorisé à indexer des documents.' }, 403);
  if (message === 'DOCUMENT_NOT_FOUND' || message === 'REQUEST_NOT_FOUND') {
    return json({ error: 'La catégorie documentaire est introuvable.' }, 404);
  }
  if (message === 'INVALID_FILE') return json({ error: 'Utilisez un PDF, JPG, PNG, WEBP ou HEIC.' }, 400);
  if (message === 'INVALID_SIZE') return json({ error: 'Le fichier doit faire moins de 12 Mo.' }, 400);
  if (message === 'INVALID_PATH' || message === 'FILE_NOT_RECEIVED') {
    return json({ error: 'Le fichier n’a pas été reçu correctement. Réessayez.' }, 409);
  }
  console.error('staff-client-documents', error);
  return json({ error: 'L’indexation est momentanément indisponible.' }, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const context = await staffContext(req);
    const body = await req.json() as Record<string, unknown>;
    const action = text(body.action, 40);
    if (action === 'prepare_upload') return await prepareUpload(body, context.workspaceId);
    if (action === 'complete_upload') return await completeUpload(body, context);
    return json({ error: 'Action inconnue.' }, 400);
  } catch (error) {
    return knownError(error);
  }
});
