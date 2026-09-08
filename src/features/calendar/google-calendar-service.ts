import { supabase, supabaseUrl } from '@/lib/supabase';
import { getGoogleAdsConnection, startGoogleAdsOAuth } from '@/features/integrations/google/google-ads-service';

export interface GoogleCalendarStatus {
  configured: boolean;
  authorized: boolean;
  calendarId: string;
  calendarName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface GoogleCalendarSyncResult {
  created: number;
  updatedInGoogle: number;
  updatedInCrm: number;
  cancelled: number;
}

async function bearerToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session?.access_token) throw new Error('Session expirée, reconnectez-vous');
  return data.session.access_token;
}

export async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const connection = await getGoogleAdsConnection();
  const settings = (connection?.settings ?? {}) as Record<string, unknown>;
  return {
    configured: Boolean(connection && settings.client_id),
    authorized: Boolean(settings.calendar_authorized_at),
    calendarId: String(settings.calendar_id || 'primary'),
    calendarName: settings.calendar_name ? String(settings.calendar_name) : null,
    lastSyncedAt: settings.calendar_last_synced_at ? String(settings.calendar_last_synced_at) : null,
    lastError: settings.calendar_last_error ? String(settings.calendar_last_error) : null,
  };
}

export const startGoogleCalendarOAuth = startGoogleAdsOAuth;

export async function syncGoogleCalendar(): Promise<GoogleCalendarSyncResult> {
  const response = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await bearerToken()}`,
    },
    body: '{}',
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    results?: Array<GoogleCalendarSyncResult & { success: boolean; error?: string }>;
  };
  const result = payload.results?.[0];
  if (!response.ok || payload.success === false || !result?.success) {
    throw new Error(result?.error || payload.error || `Google Agenda HTTP ${response.status}`);
  }
  return result;
}
