import { supabase, supabaseUrl } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { Communication, IntegrationConnection } from '@/types';

export interface IonosEmailSettings {
  email_address: string;
  sender_name: string;
  inbound_address: string;
  signature: string;
}

export interface IonosMailboxStatus {
  configured: boolean;
  email_address: string | null;
  connection_status: IntegrationConnection['status'];
}

export interface SendIonosEmailInput {
  to?: string;
  contact_id?: string;
  lead_id?: string;
  subject: string;
  content: string;
  in_reply_to?: string;
  attachments?: EmailAttachmentInput[];
}

export interface EmailAttachmentInput {
  filename: string;
  content_type: string;
  content_base64: string;
  size: number;
}

export interface FetchEmailAttachmentInput {
  communicationId: string;
  attachmentId: string;
}

const EMAIL_PAGE_SIZE = 500;

export const MAX_EMAIL_ATTACHMENTS = 5;
export const MAX_EMAIL_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;
export const EMAIL_ATTACHMENT_ACCEPT = [
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
  '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
].join(',');

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

function extensionFichier(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function formatEmailAttachmentSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

export function validateEmailAttachmentFiles(files: readonly File[]): void {
  if (files.length > MAX_EMAIL_ATTACHMENTS) {
    throw new Error(`${MAX_EMAIL_ATTACHMENTS} pièces jointes maximum par email`);
  }

  let total = 0;
  for (const file of files) {
    const contentType = EMAIL_ATTACHMENT_TYPES[extensionFichier(file.name)];
    if (!contentType) {
      throw new Error(`Format non autorisé : ${file.name}`);
    }
    if (file.size <= 0) {
      throw new Error(`Le fichier ${file.name} est vide`);
    }
    if (file.size > MAX_EMAIL_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} dépasse la limite de ${formatEmailAttachmentSize(MAX_EMAIL_ATTACHMENT_BYTES)}`);
    }
    total += file.size;
  }

  if (total > MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES) {
    throw new Error(`Les pièces jointes dépassent ${formatEmailAttachmentSize(MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES)} au total`);
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}`));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) {
        reject(new Error(`Impossible de préparer ${file.name}`));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function prepareEmailAttachments(files: readonly File[]): Promise<EmailAttachmentInput[]> {
  validateEmailAttachmentFiles(files);
  return Promise.all(files.map(async (file) => ({
    filename: file.name,
    content_type: EMAIL_ATTACHMENT_TYPES[extensionFichier(file.name)],
    content_base64: await fileToBase64(file),
    size: file.size,
  })));
}

export function buildDefaultEmailSignature(senderName: string, emailAddress: string): string {
  const identity = senderName.trim() || 'Relais Pare-Brise';
  const details = [identity, emailAddress.trim(), 'www.relaisparebrise.fr'].filter(Boolean);
  return `Cordialement,\n\n${details.join('\n')}`;
}

export function buildSignedEmailContent(content: string, signature: string): string {
  const body = content.trim();
  const footer = signature.trim();
  return footer ? `${body}\n\n${footer}` : body;
}

type EmailFunctionResponse = {
  success?: boolean;
  error?: string;
  communication?: Communication;
  configured?: boolean;
  email_address?: string | null;
  connection_status?: IntegrationConnection['status'];
};

async function jetonSession(): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Session expirée, reconnectez-vous');
  return accessToken;
}

async function appelerEmail(payload: Record<string, unknown>): Promise<EmailFunctionResponse> {
  const accessToken = await jetonSession();

  const response = await fetch(`${supabaseUrl}/functions/v1/email-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as EmailFunctionResponse;
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `Boîte mail : HTTP ${response.status}`);
  }
  return result;
}

export async function getIonosConnection(): Promise<IntegrationConnection | null> {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('provider', 'ionos')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as IntegrationConnection | null;
}

export function parseIonosSettings(connection: IntegrationConnection | null): IonosEmailSettings {
  const settings = (connection?.settings ?? {}) as Record<string, unknown>;
  const emailAddress = typeof settings.email_address === 'string' ? settings.email_address : '';
  const senderName = typeof settings.sender_name === 'string' ? settings.sender_name : 'Relais Pare-Brise';
  return {
    email_address: emailAddress,
    sender_name: senderName,
    inbound_address: typeof settings.inbound_address === 'string' ? settings.inbound_address : '',
    signature: typeof settings.signature === 'string'
      ? settings.signature
      : buildDefaultEmailSignature(senderName, emailAddress),
  };
}

export async function saveIonosSettings(settings: IonosEmailSettings): Promise<IntegrationConnection> {
  const workspaceId = await getWorkspaceId();
  const current = await getIonosConnection();
  const previous = parseIonosSettings(current);
  const normalized = {
    email_address: settings.email_address.trim().toLowerCase(),
    sender_name: settings.sender_name.trim(),
    inbound_address: settings.inbound_address.trim().toLowerCase(),
    signature: settings.signature.trim().slice(0, 2_000),
  };
  const unchanged = current
    && previous.email_address === normalized.email_address
    && previous.sender_name === normalized.sender_name
    && previous.inbound_address === normalized.inbound_address
    && previous.signature === normalized.signature;
  const payload = {
    workspace_id: workspaceId,
    provider: 'ionos' as const,
    name: 'Boîte mail IONOS',
    status: unchanged ? current.status : 'not_configured',
    settings: normalized,
    last_error: null,
  };

  const query = current
    ? supabase.from('integration_connections').update(payload).eq('id', current.id)
    : supabase.from('integration_connections').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(error.message);
  return data as IntegrationConnection;
}

export async function getIonosMailboxStatus(): Promise<IonosMailboxStatus> {
  const result = await appelerEmail({ action: 'status' });
  return {
    configured: result.configured === true,
    email_address: result.email_address ?? null,
    connection_status: result.connection_status ?? 'not_configured',
  };
}

/**
 * Charge l'historique complet par lots pour que la boite mail ne masque pas
 * les anciens messages derriere la limite implicite de Supabase.
 */
export async function fetchMailboxEmails(): Promise<Communication[]> {
  const emails: Communication[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('communications')
      .select('*')
      .in('type', ['email_inbound', 'email_outbound'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + EMAIL_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data as Communication[] | null) ?? [];
    emails.push(...page);
    if (page.length < EMAIL_PAGE_SIZE) break;
    offset += EMAIL_PAGE_SIZE;
  }

  return emails;
}

export async function sendIonosEmail(input: SendIonosEmailInput): Promise<Communication> {
  const result = await appelerEmail({
    ...input,
    request_id: crypto.randomUUID(),
  });
  if (!result.communication) throw new Error("L'email a été envoyé mais son historique n'a pas été retourné");
  return result.communication;
}

export async function fetchEmailAttachment(input: FetchEmailAttachmentInput): Promise<Blob> {
  const accessToken = await jetonSession();
  const response = await fetch(`${supabaseUrl}/functions/v1/email-attachment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      communication_id: input.communicationId,
      attachment_id: input.attachmentId,
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || `Pièce jointe inaccessible : HTTP ${response.status}`);
  }

  return response.blob();
}
