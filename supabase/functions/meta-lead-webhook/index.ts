import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function verifySignature(payload: string, signature: string, appSecret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw', hexToBytes(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expected = 'sha256=' + Array.from(new Uint8Array(signed))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    return expected === signature;
  } catch {
    return false;
  }
}

async function getMetaSecret(workspaceId: string, keyName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .rpc('vault_read_secret', { secret_name: `meta_${keyName}_${workspaceId}` });
    if (!error && data) return data;
  } catch {
    // Vault indisponible
  }

  try {
    const { data, error } = await supabase
      .from('vault_decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', `meta_${keyName}_${workspaceId}`)
      .maybeSingle();
    if (!error && data) return data.decrypted_secret;
  } catch {
    // Table indisponible
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // GET : vérification de l'URL par Meta au moment de l'abonnement.
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode !== 'subscribe' || !token) {
        return new Response('Bad Request', { status: 400, headers: corsHeaders });
      }

      const { data: connections } = await supabase
        .from('integration_connections')
        .select('settings')
        .eq('provider', 'meta');

      for (const conn of connections ?? []) {
        const settings = conn.settings as Record<string, string>;
        if (settings?.webhook_verify_token === token) {
          return new Response(challenge, {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
          });
        }
      }

      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // POST : réception d'un lead.
  //
  // Meta n'envoie que des leadgen_id, jamais les données du formulaire, et
  // impose une réponse en moins de 20 secondes. On se contente donc d'empiler
  // les identifiants et de répondre 200. L'appel à l'API Graph, qui peut être
  // lent ou échouer, est fait par meta-process-queue hors du chemin critique.
  if (req.method === 'POST') {
    try {
      const bodyText = await req.text();
      const signature = req.headers.get('x-hub-signature-256') || '';
      const body = JSON.parse(bodyText);

      const { data: connections } = await supabase
        .from('integration_connections')
        .select('workspace_id, settings')
        .eq('provider', 'meta');

      if (!connections?.length) {
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Le POST ne porte pas le verify_token : seule la signature permet de
      // rattacher l'événement à un workspace.
      let matchedWorkspace: string | null = null;
      for (const conn of connections) {
        const appSecret = await getMetaSecret(conn.workspace_id, 'app_secret');
        if (!appSecret) continue;
        if (await verifySignature(bodyText, signature, appSecret)) {
          matchedWorkspace = conn.workspace_id;
          break;
        }
      }

      if (!matchedWorkspace) {
        // 200 quand même : un 4xx pousserait Meta à rejouer indéfiniment.
        console.error('Signature Meta invalide, aucun workspace correspondant');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const rows: Record<string, unknown>[] = [];
      for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
          if (change?.field !== 'leadgen') continue;
          const leadgenId = change?.value?.leadgen_id;
          if (!leadgenId) continue;

          rows.push({
            workspace_id: matchedWorkspace,
            provider: 'meta',
            external_event_id: String(leadgenId),
            event_type: 'leadgen',
            payload: { ...change.value, page_id: entry?.id ?? null },
            processing_status: 'pending',
            next_attempt_at: new Date().toISOString(),
          });
        }
      }

      if (rows.length) {
        // ignoreDuplicates s'appuie sur l'index unique
        // (workspace_id, provider, external_event_id) : Meta renvoie parfois
        // deux fois le même lead, la base tranche.
        const { error } = await supabase
          .from('webhook_events')
          .upsert(rows, {
            onConflict: 'workspace_id,provider,external_event_id',
            ignoreDuplicates: true,
          });

        if (error) {
          console.error('Mise en file échouée:', error.message);
        }
      }

      return new Response('OK', { status: 200, headers: corsHeaders });
    } catch (err) {
      console.error('Erreur webhook Meta:', err.message);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
});
