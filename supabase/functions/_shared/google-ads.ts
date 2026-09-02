import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export const adminClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

export type GoogleSettings = {
  customer_id?: string;
  login_customer_id?: string;
  client_id?: string;
  api_version?: string;
  [key: string]: unknown;
};

export type GoogleAdsSession = {
  customerId: string;
  version: string;
  accessToken: string;
  developerToken: string;
  loginCustomerId: string;
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function cleanCustomerId(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export async function requireAdmin(req: Request): Promise<{
  userId: string;
  workspaceId: string;
}> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    throw new Error('FORBIDDEN');
  }

  return { userId: user.id, workspaceId: profile.workspace_id };
}

export async function readGoogleSecret(workspaceId: string, key: string): Promise<string> {
  const secretName = `google_ads_${key}_${workspaceId}`;
  const { data, error } = await adminClient.rpc('vault_read_secret', {
    secret_name: secretName,
  });
  if (error || !data) throw new Error(`Secret Google Ads manquant : ${key}`);
  return String(data);
}

export async function writeGoogleSecret(
  workspaceId: string,
  key: string,
  value: string,
): Promise<void> {
  const secretName = `google_ads_${key}_${workspaceId}`;
  const { error } = await adminClient.rpc('vault_create_secret', {
    new_secret_name: secretName,
    new_secret: value,
  });

  if (!error) return;

  const { error: updateError } = await adminClient.rpc('vault_update_secret', {
    secret_name: secretName,
    new_secret: value,
  });
  if (updateError) throw new Error(`Stockage Vault impossible pour ${key}: ${updateError.message}`);
}

export async function getGoogleConnection(workspaceId: string) {
  const { data, error } = await adminClient
    .from('integration_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Connexion Google Ads non configuree');
  return data;
}

export async function accessToken(
  workspaceId: string,
  settings: GoogleSettings,
): Promise<string> {
  const clientId = String(settings.client_id ?? '');
  if (!clientId) throw new Error('Client ID OAuth manquant');

  const clientSecret = await readGoogleSecret(workspaceId, 'client_secret');
  const refreshToken = await readGoogleSecret(workspaceId, 'refresh_token');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? `OAuth HTTP ${response.status}`);
  }
  return payload.access_token as string;
}

export async function createGoogleAdsSession(
  workspaceId: string,
  settings: GoogleSettings,
): Promise<GoogleAdsSession> {
  const customerId = cleanCustomerId(settings.customer_id);
  if (!customerId) throw new Error('Numero de compte Google Ads manquant');
  return {
    customerId,
    version: String(settings.api_version || 'v25'),
    accessToken: await accessToken(workspaceId, settings),
    developerToken: await readGoogleSecret(workspaceId, 'developer_token'),
    loginCustomerId: cleanCustomerId(settings.login_customer_id),
  };
}

export async function googleAdsSearchWithSession(
  session: GoogleAdsSession,
  query: string,
): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    'developer-token': session.developerToken,
    'Content-Type': 'application/json',
  };
  if (session.loginCustomerId) headers['login-customer-id'] = session.loginCustomerId;

  const response = await fetch(
    `https://googleads.googleapis.com/${session.version}/customers/${session.customerId}/googleAds:searchStream`,
    { method: 'POST', headers, body: JSON.stringify({ query }) },
  );
  const payload = await response.json();
  if (!response.ok) {
    const detail = payload?.error?.message ?? `Google Ads HTTP ${response.status}`;
    throw new Error(detail);
  }

  const chunks = Array.isArray(payload) ? payload : [];
  return chunks.flatMap((chunk) => Array.isArray(chunk?.results) ? chunk.results : []);
}

export async function googleAdsSearch(
  workspaceId: string,
  settings: GoogleSettings,
  query: string,
): Promise<Record<string, unknown>[]> {
  return googleAdsSearchWithSession(await createGoogleAdsSession(workspaceId, settings), query);
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function automationAuthorized(req: Request): boolean {
  const provided = req.headers.get('apikey') ?? '';
  const configured = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  try {
    const expected = (JSON.parse(configured) as Record<string, string>).automations ?? '';
    if (!provided || !expected || provided.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < provided.length; index++) {
      difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
    }
    return difference === 0;
  } catch {
    return false;
  }
}
