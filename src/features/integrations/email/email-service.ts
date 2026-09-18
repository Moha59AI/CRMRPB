import { supabase, supabaseUrl } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { Communication, IntegrationConnection } from '@/types';

export interface IonosEmailSettings {
  email_address: string;
  sender_name: string;
  inbound_address: string;
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
}

type EmailFunctionResponse = {
  success?: boolean;
  error?: string;
  communication?: Communication;
  configured?: boolean;
  email_address?: string | null;
  connection_status?: IntegrationConnection['status'];
};

async function appelerEmail(payload: Record<string, unknown>): Promise<EmailFunctionResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Session expirée, reconnectez-vous');

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
  return {
    email_address: typeof settings.email_address === 'string' ? settings.email_address : '',
    sender_name: typeof settings.sender_name === 'string' ? settings.sender_name : 'Relais Pare-Brise',
    inbound_address: typeof settings.inbound_address === 'string' ? settings.inbound_address : '',
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
  };
  const unchanged = current
    && previous.email_address === normalized.email_address
    && previous.sender_name === normalized.sender_name
    && previous.inbound_address === normalized.inbound_address;
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

export async function sendIonosEmail(input: SendIonosEmailInput): Promise<Communication> {
  const result = await appelerEmail({
    ...input,
    request_id: crypto.randomUUID(),
  });
  if (!result.communication) throw new Error("L'email a été envoyé mais son historique n'a pas été retourné");
  return result.communication;
}
