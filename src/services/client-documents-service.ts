import { supabase } from '@/lib/supabase';

export type ClientDocumentStatus = 'requested' | 'uploaded' | 'validated' | 'rejected';

export interface ClientDocumentItem {
  id: string;
  document_type: string;
  label: string;
  required: boolean;
  status: ClientDocumentStatus;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string | null;
  rejection_reason: string | null;
  preview_url?: string | null;
}

export interface ClientDocumentRequestSummary {
  id: string;
  status: 'open' | 'complete' | 'revoked' | 'expired';
  expires_at: string;
  submitted_at: string | null;
  created_at: string;
  items: ClientDocumentItem[];
}

export interface ClientDocumentRequestHistory extends ClientDocumentRequestSummary {
  lead_id: string;
}

export interface ClientDocumentSession {
  client_first_name: string | null;
  selected_offer: string | null;
  request_status: ClientDocumentRequestSummary['status'];
  expires_at: string;
  submitted_at: string | null;
  items: Omit<ClientDocumentItem, 'storage_path'>[];
}

interface CreatedRequest {
  request_id: string;
  access_token: string;
  expires_at: string;
}

const portalBaseUrl = (
  import.meta.env.VITE_CLIENT_PORTAL_URL as string | undefined
)?.replace(/\/$/, '') || 'https://crm.relaisparebrise.fr/documents';

export function clientDocumentPortalUrl(token: string): string {
  return `${portalBaseUrl}?token=${encodeURIComponent(token)}`;
}

export async function createClientDocumentRequest(leadId: string): Promise<CreatedRequest & { url: string }> {
  const { data, error } = await supabase.rpc('create_client_document_request', { p_lead_id: leadId });
  if (error) throw new Error(error.message);
  const created = (data as CreatedRequest[] | null)?.[0];
  if (!created?.access_token) throw new Error('Le lien documentaire n’a pas été créé.');
  return { ...created, url: clientDocumentPortalUrl(created.access_token) };
}

export async function fetchLatestClientDocumentRequest(leadId: string): Promise<ClientDocumentRequestSummary | null> {
  const { data: request, error: requestError } = await supabase
    .from('client_document_requests')
    .select('id, status, expires_at, submitted_at, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) return null;

  const { data: items, error: itemsError } = await supabase
    .from('client_document_items')
    .select('id, document_type, label, required, status, storage_path, original_name, mime_type, size_bytes, uploaded_at, rejection_reason')
    .eq('request_id', request.id)
    .order('created_at');
  if (itemsError) throw new Error(itemsError.message);

  return { ...request, items: (items ?? []) as ClientDocumentItem[] } as ClientDocumentRequestSummary;
}

export async function fetchClientDocumentHistory(leadIds: string[]): Promise<ClientDocumentRequestHistory[]> {
  if (leadIds.length === 0) return [];

  const { data: requests, error: requestsError } = await supabase
    .from('client_document_requests')
    .select('id, lead_id, status, expires_at, submitted_at, created_at')
    .in('lead_id', leadIds)
    .in('status', ['open', 'complete'])
    .order('created_at', { ascending: false });
  if (requestsError) throw new Error(requestsError.message);
  if (!requests?.length) return [];

  const { data: items, error: itemsError } = await supabase
    .from('client_document_items')
    .select('id, request_id, document_type, label, required, status, storage_path, original_name, mime_type, size_bytes, uploaded_at, rejection_reason')
    .in('request_id', requests.map((request) => request.id))
    .order('created_at');
  if (itemsError) throw new Error(itemsError.message);

  return requests.map((request) => ({
    ...request,
    items: (items ?? []).filter((item) => item.request_id === request.id),
  })) as ClientDocumentRequestHistory[];
}

async function invokePortal<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('client-documents', { body });
  if (error) throw new Error(error.message);
  const response = data as T & { error?: string };
  if (response?.error) throw new Error(response.error);
  return response;
}

export function fetchClientDocumentSession(token: string): Promise<ClientDocumentSession> {
  return invokePortal<ClientDocumentSession>({ action: 'session', token });
}

export async function uploadClientDocument(
  token: string,
  itemId: string,
  file: File,
): Promise<{ complete: boolean }> {
  const prepared = await invokePortal<{ path: string; upload_token: string }>({
    action: 'prepare_upload', token, item_id: itemId,
    file_name: file.name, mime_type: file.type, size_bytes: file.size,
  });

  const { error: uploadError } = await supabase.storage
    .from('client-documents')
    .uploadToSignedUrl(prepared.path, prepared.upload_token, file, {
      contentType: file.type,
    });
  if (uploadError) throw new Error(uploadError.message);

  return invokePortal<{ success: true; complete: boolean }>({
    action: 'complete_upload', token, item_id: itemId, path: prepared.path,
    file_name: file.name, mime_type: file.type, size_bytes: file.size,
  });
}

export async function createStaffDocumentPreviewUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('client-documents').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Aperçu indisponible.');
  return data.signedUrl;
}
