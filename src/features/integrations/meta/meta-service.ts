import { supabase } from '@/lib/supabase';
import { supabaseUrl } from '@/lib/supabase';
import { META_LEAD_WEBHOOK_PATH } from '@/config/constants';
import type { IntegrationConnection } from '@/types';

export interface MetaSettings {
  connection_name: string;
  meta_app_id: string;
  meta_app_secret_ref: string | null;
  business_manager_id: string;
  ad_account_id: string;
  facebook_page_id: string;
  page_access_token_ref: string | null;
  meta_pixel_id: string;
  conversions_api_token_ref: string | null;
  graph_api_version: string;
  website_url: string;
  test_event_code: string;
  webhook_verify_token: string;
}

const META_FIELDS: (keyof MetaSettings)[] = [
  'connection_name',
  'meta_app_id',
  'business_manager_id',
  'ad_account_id',
  'facebook_page_id',
  'meta_pixel_id',
  'graph_api_version',
  'website_url',
  'test_event_code',
  'webhook_verify_token',
];

const SECRET_FIELDS: (keyof MetaSettings)[] = [
  'meta_app_secret_ref',
  'page_access_token_ref',
  'conversions_api_token_ref',
];

export function generateVerifyToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [8, 4, 4, 12];
  return segments
    .map((len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
    .join('-');
}

export function getMetaWebhookUrl(): string {
  return `${supabaseUrl}/functions/v1/${META_LEAD_WEBHOOK_PATH}`;
}

export async function getMetaConnection(): Promise<IntegrationConnection | null> {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('provider', 'meta')
    .maybeSingle();

  if (error) {
    console.error('Error fetching Meta connection:', error.message);
    return null;
  }

  return data as IntegrationConnection | null;
}

export async function saveMetaSettings(settings: MetaSettings, secrets: Partial<Record<string, string>>): Promise<{ error: string | null }> {
  const connection = await getMetaConnection();
  const profile = await supabase.auth.getUser();
  const userId = profile.data.user?.id;

  // Get workspace_id from profile
  const { data: profileData } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();

  const workspaceId = profileData?.workspace_id;
  if (!workspaceId) return { error: 'Unable to determine workspace' };

  // Build the settings JSONB - only non-secret fields go in settings
  const settingsJson: Record<string, string> = {};
  META_FIELDS.forEach((field) => {
    const value = settings[field];
    if (value !== undefined && value !== '') {
      settingsJson[field] = value as string;
    }
  });

  // Add secret references (not the actual secrets)
  SECRET_FIELDS.forEach((field) => {
    if (settings[field]) {
      settingsJson[field] = settings[field] as string;
    }
  });

  // Store actual secrets via edge function (encrypted server-side)
  const secretEntries = Object.entries(secrets).filter(([, v]) => v && v.trim() !== '');
  if (secretEntries.length > 0) {
    const cleanSecrets: Record<string, string> = {};
    for (const [k, v] of secretEntries) {
      if (v) cleanSecrets[k] = v;
    }
    const { error: secretsError } = await storeMetaSecrets(workspaceId, cleanSecrets);
    // Sans cette remontee, la page affichait une confirmation alors que les
    // secrets n'avaient pas ete stockes : la connexion Meta paraissait
    // configuree mais aucun lead ne pouvait etre verifie ni recupere.
    if (secretsError) return { error: secretsError };
  }

  const payload = {
    workspace_id: workspaceId,
    provider: 'meta' as const,
    name: settings.connection_name || 'Meta Ads',
    status: 'connected' as const,
    settings: settingsJson,
  };

  if (connection) {
    const { error } = await supabase
      .from('integration_connections')
      .update(payload)
      .eq('id', connection.id);
    return { error: error?.message ?? null };
  } else {
    const { error } = await supabase
      .from('integration_connections')
      .insert(payload);
    return { error: error?.message ?? null };
  }
}

// Les Edge Functions Meta appellent supabase.auth.getUser(token) : elles
// attendent le jeton de session de l'utilisateur connecte, pas la cle anon.
// Envoyer la cle anon produit un 401 systematique.
async function bearerToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string);
}

async function storeMetaSecrets(
  workspaceId: string,
  secrets: Record<string, string>
): Promise<{ error: string | null }> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-store-secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await bearerToken()}`,
      },
      body: JSON.stringify({ workspace_id: workspaceId, secrets }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        error: (data.error as string) || `Enregistrement des secrets: HTTP ${response.status}`,
      };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Enregistrement des secrets impossible : ${message}` };
  }
}

type FunctionResult = {
  success: boolean;
  error: string | null;
  data: Record<string, unknown>;
};

async function callMetaFunction(
  name: string,
  body?: Record<string, unknown>
): Promise<FunctionResult> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await bearerToken()}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        success: false,
        error: (data.error as string) || `HTTP ${response.status}`,
        data,
      };
    }

    return {
      success: (data.success as boolean) ?? true,
      error: (data.error as string) ?? null,
      data,
    };
  } catch (err) {
    // Sans ce catch, une coupure reseau ou un blocage CORS rejetait la
    // promesse : le handler appelant levait avant d'atteindre son toast,
    // et l'utilisateur ne voyait strictement rien se passer.
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Appel impossible : ${message}`, data: {} };
  }
}

export async function testMetaConnection(): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callMetaFunction('meta-test-connection');
  return { success, error };
}

export async function syncMetaForms(): Promise<{ success: boolean; error: string | null; forms?: unknown[] }> {
  const { success, error, data } = await callMetaFunction('meta-sync-forms');
  return { success, error, forms: (data.forms as unknown[]) ?? [] };
}

export async function subscribePageToLeads(): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callMetaFunction('meta-subscribe-leads');
  return { success, error };
}

export async function sendTestConversionEvent(): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callMetaFunction('meta-conversions', { action: 'test' });
  return { success, error };
}

export function parseSettingsFromConnection(connection: IntegrationConnection | null): MetaSettings {
  const s = (connection?.settings ?? {}) as Record<string, string>;
  return {
    connection_name: s.connection_name ?? '',
    meta_app_id: s.meta_app_id ?? '',
    meta_app_secret_ref: s.meta_app_secret_ref ?? null,
    business_manager_id: s.business_manager_id ?? '',
    ad_account_id: s.ad_account_id ?? '',
    facebook_page_id: s.facebook_page_id ?? '',
    page_access_token_ref: s.page_access_token_ref ?? null,
    meta_pixel_id: s.meta_pixel_id ?? '',
    conversions_api_token_ref: s.conversions_api_token_ref ?? null,
    graph_api_version: s.graph_api_version ?? 'v21.0',
    website_url: s.website_url ?? '',
    test_event_code: s.test_event_code ?? '',
    webhook_verify_token: s.webhook_verify_token ?? '',
  };
}

export function maskSecret(value: string | null): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}
