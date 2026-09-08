import { supabase, supabaseUrl } from '@/lib/supabase';
import type { IntegrationConnection } from '@/types';

export interface OnifySyncCounts {
  contacts: number;
  notes: number;
  calls: number;
  invoices: number;
  quotes: number;
  credits: number;
  notesRemaining: boolean;
}

export interface OnifySettings {
  direction: 'onify_to_crm';
  last_sync_at: string | null;
  notes_page: number;
  notes_remaining: boolean;
  last_counts: OnifySyncCounts | null;
}

type OnifySyncResponse = {
  success?: boolean;
  error?: string | null;
  results?: Array<OnifySyncCounts & { success: boolean; error?: string }>;
};

export async function getOnifyConnection(): Promise<IntegrationConnection | null> {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('provider', 'onify')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as IntegrationConnection | null;
}

export function parseOnifySettings(connection: IntegrationConnection | null): OnifySettings {
  const settings = (connection?.settings ?? {}) as Record<string, unknown>;
  return {
    direction: 'onify_to_crm',
    last_sync_at: typeof settings.last_sync_at === 'string' ? settings.last_sync_at : null,
    notes_page: Number(settings.notes_page ?? 1),
    notes_remaining: settings.notes_remaining === true,
    last_counts: settings.last_counts && typeof settings.last_counts === 'object'
      ? settings.last_counts as OnifySyncCounts
      : null,
  };
}

export async function syncOnify(): Promise<OnifySyncCounts> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Session expirée, reconnectez-vous');

  const response = await fetch(`${supabaseUrl}/functions/v1/onify-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: '{}',
  });
  const payload = await response.json().catch(() => ({})) as OnifySyncResponse;
  const result = payload.results?.[0];
  if (!response.ok || payload.success === false || !result?.success) {
    throw new Error(result?.error || payload.error || `Onify : HTTP ${response.status}`);
  }
  return result;
}
