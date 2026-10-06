import { supabase, supabaseUrl } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { Communication, IntegrationConnection } from '@/types';

export interface IonosEmailSettings {
  email_address: string;
  sender_name: string;
  signature: string;
}

export interface IonosMailboxStatus {
  configured: boolean;
  email_address: string | null;
  connection_status: IntegrationConnection['status'];
}

export interface IonosCredentialStatus {
  configured: boolean;
  email_address: string | null;
}

export interface IonosSyncResult {
  imported: number;
  /** Anciens messages dont la version HTML vient d'être récupérée. */
  enriched?: number;
  duplicates: number;
  skipped: number;
  remaining_history: boolean;
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

export interface LinkEmailToLeadInput {
  communicationId: string;
  leadId: string;
}

const EMAIL_PAGE_SIZE = 500;
const EMAIL_LIST_COLUMNS = [
  'id', 'workspace_id', 'lead_id', 'case_id', 'contact_id', 'user_id',
  'type', 'direction', 'status', 'content', 'subject', 'duration_seconds',
  'recording_url', 'provider', 'external_id', 'delivered_at', 'sender_email',
  'recipient_email', 'email_message_id', 'email_in_reply_to', 'email_smtp_accepted_at',
  'email_sent_copy_saved_at', 'email_attachments',
  'created_at',
].join(',');

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
    signature: typeof settings.signature === 'string'
      ? settings.signature
      : buildDefaultEmailSignature(senderName, emailAddress),
  };
}

export async function saveIonosSettings(settings: IonosEmailSettings): Promise<IntegrationConnection> {
  const workspaceId = await getWorkspaceId();
  const current = await getIonosConnection();
  const previous = parseIonosSettings(current);
  const normalizedEmail = settings.email_address.trim().toLowerCase();
  const preservedSettings = current && previous.email_address === normalizedEmail
    ? ((current.settings ?? {}) as Record<string, unknown>)
    : {};
  const normalized = {
    ...preservedSettings,
    email_address: normalizedEmail,
    sender_name: settings.sender_name.trim(),
    signature: settings.signature.trim().slice(0, 2_000),
  };
  const payload = {
    workspace_id: workspaceId,
    provider: 'ionos' as const,
    name: 'Boîte mail IONOS',
    status: current && previous.email_address === normalizedEmail
      ? current.status
      : 'not_configured',
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

async function appelerFonctionIonos<T>(
  functionName: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
): Promise<T> {
  const accessToken = await jetonSession();
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { success?: boolean; error?: string };
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `Boîte IONOS : HTTP ${response.status}`);
  }
  return result;
}

export async function getIonosCredentialStatus(): Promise<IonosCredentialStatus> {
  return appelerFonctionIonos<IonosCredentialStatus>('ionos-email-secret', { method: 'GET' });
}

export async function saveIonosPassword(password: string): Promise<void> {
  await appelerFonctionIonos('ionos-email-secret', { body: { password } });
}

export async function syncIonosMailbox(): Promise<IonosSyncResult> {
  const response = await appelerFonctionIonos<{
    results?: Array<IonosSyncResult & { success: boolean; error?: string }>;
  }>('ionos-mail-sync');
  const result = response.results?.[0];
  if (!result) throw new Error('Aucun compte IONOS à synchroniser');
  if (!result.success) throw new Error(result.error || 'Synchronisation IONOS impossible');
  return result;
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
      // Le HTML peut peser plusieurs centaines de Ko : la liste reste legere
      // et le charge seulement pour le message effectivement ouvert.
      .select(EMAIL_LIST_COLUMNS)
      .in('type', ['email_inbound', 'email_outbound'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + EMAIL_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = ((data ?? []) as unknown as Array<Omit<Communication, 'email_html'>>)
      .map((email) => ({ ...email, email_html: null }));
    emails.push(...page);
    if (page.length < EMAIL_PAGE_SIZE) break;
    offset += EMAIL_PAGE_SIZE;
  }

  return emails;
}

export async function fetchEmailHtml(communicationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('communications')
    .select('email_html')
    .eq('id', communicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.email_html === 'string' ? data.email_html : null;
}

export async function linkEmailToLead(input: LinkEmailToLeadInput): Promise<Communication> {
  const { data, error } = await supabase.rpc('rattacher_email_au_lead', {
    p_communication_id: input.communicationId,
    p_lead_id: input.leadId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Le rattachement n'a pas été enregistré");
  return data as Communication;
}

export async function sendIonosEmail(input: SendIonosEmailInput): Promise<Communication> {
  const result = await appelerEmail({
    ...input,
    request_id: crypto.randomUUID(),
  });
  if (!result.communication) throw new Error("L'email a été envoyé mais son historique n'a pas été retourné");
  return result.communication;
}

/**
 * Suit ou cesse de suivre un message.
 *
 * Le suivi est partage : une seule boite pour l'equipe, donc ce que l'un
 * signale, l'autre doit le voir.
 */
export async function basculerSuiviEmail(id: string, suivi: boolean): Promise<void> {
  const { error } = await supabase
    .from('communications')
    .update({ starred_at: suivi ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Marque plusieurs messages lus ou non lus.
 *
 * Remettre en non lu efface la date : le repere redevient « jamais ouvert »,
 * ce qui est bien ce qu'on demande en le faisant.
 */
export async function marquerEmailsLus(ids: string[], lu: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('communications')
    .update({ read_at: lu ? new Date().toISOString() : null })
    .in('id', ids);
  if (error) throw new Error(error.message);
}

/**
 * Marque un message recu comme lu.
 *
 * Une seule ecriture, la premiere : `read_at` garde la date de la premiere
 * ouverture, pas de la derniere. Rouvrir un message dix fois ne doit pas
 * deplacer ce reperage.
 */
export async function marquerEmailLu(id: string): Promise<void> {
  const { error } = await supabase
    .from('communications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw new Error(error.message);
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
