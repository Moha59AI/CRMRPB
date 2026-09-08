import { supabase, supabaseUrl } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { IntegrationConnection } from '@/types';

export interface GoogleAdsSettings {
  connection_name: string;
  customer_id: string;
  login_customer_id: string;
  client_id: string;
  api_version: string;
  developer_token_ref: string | null;
  client_secret_ref: string | null;
  refresh_token_ref: string | null;
  customer_name?: string;
  currency_code?: string;
  time_zone?: string;
}

async function bearerToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session?.access_token) throw new Error('Session expirée, reconnectez-vous');
  return data.session.access_token;
}

async function callGoogleFunction<T extends Record<string, unknown>>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await bearerToken()}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; success?: boolean };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `${name}: HTTP ${response.status}`);
  }
  return payload;
}

export async function getGoogleAdsConnection(): Promise<IntegrationConnection | null> {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('provider', 'google')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as IntegrationConnection | null;
}

export function parseGoogleAdsSettings(connection: IntegrationConnection | null): GoogleAdsSettings {
  const settings = (connection?.settings ?? {}) as Record<string, string>;
  return {
    connection_name: settings.connection_name || connection?.name || 'Google Ads',
    customer_id: settings.customer_id ?? '',
    login_customer_id: settings.login_customer_id ?? '',
    client_id: settings.client_id ?? '',
    api_version: settings.api_version ?? 'v25',
    developer_token_ref: settings.developer_token_ref ?? null,
    client_secret_ref: settings.client_secret_ref ?? null,
    refresh_token_ref: settings.refresh_token_ref ?? null,
    customer_name: settings.customer_name,
    currency_code: settings.currency_code,
    time_zone: settings.time_zone,
  };
}

export async function saveGoogleAdsSettings(
  settings: GoogleAdsSettings,
  secrets: { developer_token?: string; client_secret?: string },
): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const existing = await getGoogleAdsConnection();
  const cleanSecrets = Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => Boolean(value?.trim())),
  );

  if (Object.keys(cleanSecrets).length) {
    await callGoogleFunction('google-ads-store-secrets', { secrets: cleanSecrets });
  }

  const previous = parseGoogleAdsSettings(existing);
  const previousRaw = (existing?.settings ?? {}) as Record<string, unknown>;
  const storedSettings = {
    // Les réglages Agenda partagent volontairement la connexion OAuth Google.
    // Un enregistrement depuis l'écran Google Ads ne doit pas les effacer.
    ...previousRaw,
    connection_name: settings.connection_name,
    customer_id: settings.customer_id.replace(/\D/g, ''),
    login_customer_id: settings.login_customer_id.replace(/\D/g, ''),
    client_id: settings.client_id.trim(),
    api_version: settings.api_version || 'v25',
    developer_token_ref: secrets.developer_token?.trim() ? 'stored' : previous.developer_token_ref,
    client_secret_ref: secrets.client_secret?.trim() ? 'stored' : previous.client_secret_ref,
    refresh_token_ref: previous.refresh_token_ref,
    customer_name: previous.customer_name,
    currency_code: previous.currency_code,
    time_zone: previous.time_zone,
  };
  const payload = {
    workspace_id: workspaceId,
    provider: 'google' as const,
    name: settings.connection_name || 'Google Ads',
    status: existing?.status ?? 'not_configured',
    settings: storedSettings,
  };

  const result = existing
    ? await supabase.from('integration_connections').update(payload).eq('id', existing.id)
    : await supabase.from('integration_connections').insert(payload);
  if (result.error) throw new Error(result.error.message);
}

export async function startGoogleAdsOAuth(): Promise<{ authUrl: string; redirectUri: string }> {
  const payload = await callGoogleFunction<{ auth_url: string; redirect_uri: string }>('google-ads-oauth-start');
  return { authUrl: payload.auth_url, redirectUri: payload.redirect_uri };
}

export async function testGoogleAdsConnection(): Promise<void> {
  await callGoogleFunction('google-ads-test-connection');
}

export async function syncGoogleAds(): Promise<void> {
  await callGoogleFunction('google-ads-sync');
}
