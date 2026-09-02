import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 6;

function isAuthorized(req: Request): boolean {
  const provided = req.headers.get('apikey') ?? '';
  const configured = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';

  try {
    const keys = JSON.parse(configured) as Record<string, string>;
    const expected = keys.automations ?? '';
    if (!provided || !expected || provided.length !== expected.length) return false;

    let difference = 0;
    for (let i = 0; i < provided.length; i++) {
      difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return difference === 0;
  } catch {
    return false;
  }
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+33')) return '0' + cleaned.slice(3);
  if (cleaned.startsWith('33') && cleaned.length === 11) return '0' + cleaned.slice(2);
  return cleaned;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizeRegistration(reg: string): string {
  return reg.toUpperCase().replace(/\s/g, '');
}

// Meta nomme les champs d'apres le formulaire : les questions standards ont un
// nom fixe, mais les questions personnalisees arrivent avec le libelle saisi
// dans l'editeur Meta. On teste donc plusieurs noms possibles.
function pick(fields: Record<string, string>, candidates: string[]): string | null {
  for (const name of candidates) {
    const value = fields[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function splitFullName(value: string): [string | null, string | null] {
  const parts = value.trim().split(/\s+/);
  const first = parts[0] ?? null;
  const last = parts.slice(1).join(' ');
  return [first, last.length > 0 ? last : null];
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

// Backoff exponentiel : 2, 4, 8, 16, 32, 64 minutes.
function backoffMinutes(attempts: number): number {
  return Math.pow(2, Math.min(attempts, MAX_ATTEMPTS));
}

async function markRetry(eventId: string, attempts: number, message: string) {
  const next = new Date(Date.now() + backoffMinutes(attempts) * 60000);
  const exhausted = attempts >= MAX_ATTEMPTS;

  await supabase
    .from('webhook_events')
    .update({
      processing_status: 'error',
      error_message: message.slice(0, 500),
      processing_attempts: attempts,
      // next_attempt_at a null = sorti de la file, plus jamais repris.
      next_attempt_at: exhausted ? null : next.toISOString(),
    })
    .eq('id', eventId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const nowIso = new Date().toISOString();

    const { data: jobs, error: jobsError } = await supabase
      .from('webhook_events')
      .select('id, workspace_id, external_event_id, payload, processing_attempts')
      .eq('provider', 'meta')
      .eq('event_type', 'leadgen')
      .in('processing_status', ['pending', 'error'])
      .lte('next_attempt_at', nowIso)
      .order('received_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (jobsError) throw new Error(jobsError.message);

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0, failed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      const attempts = (job.processing_attempts ?? 0) + 1;

      await supabase
        .from('webhook_events')
        .update({ processing_status: 'processing', processing_attempts: attempts })
        .eq('id', job.id);

      try {
        const { data: connection } = await supabase
          .from('integration_connections')
          .select('settings')
          .eq('workspace_id', job.workspace_id)
          .eq('provider', 'meta')
          .maybeSingle();

        const settings = (connection?.settings ?? {}) as Record<string, string>;
        const graphVersion = settings.graph_api_version || 'v21.0';

        const pageAccessToken = await getMetaSecret(job.workspace_id, 'page_access_token');
        if (!pageAccessToken) throw new Error('Aucun page_access_token configure');

        const fields = 'field_data,ad_id,adset_id,campaign_id,form_id,created_time,platform';
        const leadUrl = `https://graph.facebook.com/${graphVersion}/${job.external_event_id}`
          + `?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`;

        const leadResp = await fetch(leadUrl);
        const leadData = await leadResp.json();

        // 429 (quota), code 4 (rate limit) et code 190 (token expire) sont
        // transitoires : on remet en file avec backoff plutot que d'abandonner.
        const errCode = leadData?.error?.code;
        if (leadResp.status === 429 || errCode === 4 || errCode === 190) {
          const why = leadData?.error?.message ?? 'quota ou token';
          await markRetry(job.id, attempts, `Graph ${leadResp.status}: ${why}`);
          failed++;
          continue;
        }

        if (leadData?.error) throw new Error(leadData.error.message);

        const leadFields: Record<string, string> = {};
        for (const fd of leadData.field_data ?? []) {
          const raw = Array.isArray(fd.values) ? fd.values[0] : fd.values;
          leadFields[String(fd.name).toLowerCase()] = raw;
        }

        const { data: metaForm } = await supabase
          .from('meta_forms')
          .select('field_mapping')
          .eq('meta_form_id', leadData.form_id)
          .maybeSingle();

        const mapping = (metaForm?.field_mapping ?? {}) as Record<string, string>;
        const mapped: Record<string, string | null> = {
          first_name: null, last_name: null, phone: null, email: null,
          city: null, vehicle_registration: null, vehicle_make: null, vehicle_model: null,
        };

        for (const [metaField, leadField] of Object.entries(mapping)) {
          if (leadField === 'ignore' || leadField === 'custom') continue;
          const value = leadFields[metaField.toLowerCase()];
          if (!value) continue;

          if (leadField === 'full_name') {
            const [first, last] = splitFullName(value);
            mapped.first_name = first;
            mapped.last_name = last;
          } else if (leadField === 'phone') {
            mapped.phone = normalizePhone(value);
          } else if (leadField === 'email') {
            mapped.email = normalizeEmail(value);
          } else if (leadField === 'vehicle_registration') {
            mapped.vehicle_registration = normalizeRegistration(value);
          } else {
            mapped[leadField] = value;
          }
        }

        if (!mapped.first_name && !mapped.last_name) {
          const full = pick(leadFields, ['full_name', 'nom_complet']);
          if (full) {
            const [first, last] = splitFullName(full);
            mapped.first_name = first;
            mapped.last_name = last;
          } else {
            mapped.first_name = pick(leadFields, ['first_name', 'prenom', 'prénom']);
            mapped.last_name = pick(leadFields, ['last_name', 'nom', 'surname']);
          }
        }

        if (!mapped.phone) {
          const p = pick(leadFields, [
            'phone_number', 'phone', 'telephone', 'téléphone',
            'mobile', 'numero_de_telephone', 'numéro_de_téléphone',
          ]);
          if (p) mapped.phone = normalizePhone(p);
        }
        if (!mapped.email) {
          const e = pick(leadFields, ['email', 'e_mail', 'courriel', 'adresse_e_mail']);
          if (e) mapped.email = normalizeEmail(e);
        }
        if (!mapped.city) {
          mapped.city = pick(leadFields, ['city', 'ville', 'zip_code', 'code_postal']);
        }
        if (!mapped.vehicle_registration) {
          const r = pick(leadFields, ['vehicle_registration', 'immatriculation', 'plaque']);
          if (r) mapped.vehicle_registration = normalizeRegistration(r);
        }
        if (!mapped.vehicle_make) {
          mapped.vehicle_make = pick(leadFields, ['vehicle_make', 'marque']);
        }
        if (!mapped.vehicle_model) {
          mapped.vehicle_model = pick(leadFields, ['vehicle_model', 'modele', 'modèle']);
        }

        const payload = (job.payload ?? {}) as Record<string, unknown>;

        const { error: leadError } = await supabase.rpc('upsert_lead_from_webhook', {
          p_workspace_id: job.workspace_id,
          p_first_name: mapped.first_name,
          p_last_name: mapped.last_name,
          p_phone: mapped.phone,
          p_email: mapped.email,
          p_city: mapped.city,
          p_vehicle_registration: mapped.vehicle_registration,
          p_vehicle_make: mapped.vehicle_make,
          p_vehicle_model: mapped.vehicle_model,
          p_source: 'meta',
          p_meta_lead_id: job.external_event_id,
          p_meta_page_id: payload.page_id ?? null,
          p_meta_form_id: leadData.form_id ?? null,
          p_meta_ad_id: leadData.ad_id ?? null,
          p_meta_adset_id: leadData.adset_id ?? null,
          p_meta_campaign_id: leadData.campaign_id ?? null,
          p_raw_payload: leadData,
          p_received_at: leadData.created_time ?? new Date().toISOString(),
        });

        if (leadError) throw new Error(`Creation du lead: ${leadError.message}`);

        await supabase
          .from('webhook_events')
          .update({
            processing_status: 'processed',
            processed_at: new Date().toISOString(),
            error_message: null,
            next_attempt_at: null,
            // Les noms de champs renvoyes par Meta sont conserves : c'est ce
            // qui permet de regler le mapping sans deviner.
            payload: {
              ...payload,
              champs_recus: Object.keys(leadFields),
              lead: leadData,
            },
          })
          .eq('id', job.id);

        processed++;
      } catch (err) {
        await markRetry(job.id, attempts, err?.message ?? String(err));
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed, failed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
