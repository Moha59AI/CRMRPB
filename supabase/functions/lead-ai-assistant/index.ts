import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const MODEL = 'gpt-5.6-terra';
const INPUT_USD_PER_MILLION = 2;
const OUTPUT_USD_PER_MILLION = 12;
const MAX_NOTE_LENGTH = 2_000;
const MAX_NOTES = 100;
const MAX_COMMUNICATIONS = 50;
const MAX_TASKS = 50;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireAdvisor(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('PROFILE_NOT_FOUND');
  if (!['admin', 'manager', 'advisor'].includes(profile.role)) throw new Error('FORBIDDEN');

  return { userId: user.id, workspaceId: profile.workspace_id as string };
}

async function readApiKey(workspaceId: string): Promise<string> {
  const { data, error } = await adminClient.rpc('vault_read_secret', {
    secret_name: 'openai_api_key_' + workspaceId,
  });
  if (error) throw new Error('VAULT_READ_FAILED: ' + error.message);
  if (typeof data !== 'string' || !data) throw new Error('OPENAI_NOT_CONFIGURED');
  return data;
}

function responseText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const rawContent = (item as { content?: unknown }).content;
    const content = Array.isArray(rawContent) ? rawContent : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    const { userId, workspaceId } = await requireAdvisor(req);
    const body = await req.json();
    const leadId = typeof body?.leadId === 'string' ? body.leadId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(leadId)) {
      return jsonResponse({ error: 'Identifiant du lead invalide' }, 400);
    }

    const [
      { data: lead, error: leadError },
      { data: notes, error: notesError },
      { data: communications, error: communicationsError },
      { data: tasks, error: tasksError },
      { data: appointments, error: appointmentsError },
      { data: cases, error: casesError },
      { data: documentRequests, error: documentRequestsError },
    ] = await Promise.all([
      adminClient
        .from('leads')
        .select('id, assigned_user_id, city, postal_code, intervention_city, intervention_postal_code, vehicle_make, vehicle_model, insurance, offer, glass_type, has_adas_camera, franchise_amount, score, source, status, campaign_name, advisor_notes, next_action_at, received_at, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('id', leadId)
        .maybeSingle(),
      adminClient
        .from('notes')
        .select('id, content, created_at')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTES),
      adminClient
        .from('communications')
        .select('id, type, direction, status, content, created_at')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(MAX_COMMUNICATIONS),
      adminClient
        .from('tasks')
        .select('id, title, description, type, priority, status, due_at, created_at')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(MAX_TASKS),
      adminClient
        .from('appointments')
        .select('id, type, status, start_time, end_time, created_at')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('start_time', { ascending: false })
        .limit(20),
      adminClient
        .from('windscreen_cases')
        .select('id, status, appointment_date, glass_type, has_sensors, has_adas_camera, insurance_claim_number, franchise_amount, offer, gift_type, gift_amount, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(10),
      adminClient
        .from('client_document_requests')
        .select('id, status, expires_at, last_opened_at, submitted_at, client_document_items(label, required, status, rejection_reason)')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    if (leadError) throw new Error('LEAD_READ_FAILED: ' + leadError.message);
    if (!lead) return jsonResponse({ error: 'Lead introuvable' }, 404);
    if (notesError) throw new Error('NOTES_READ_FAILED: ' + notesError.message);
    if (communicationsError) throw new Error('COMMUNICATIONS_READ_FAILED: ' + communicationsError.message);
    if (tasksError) throw new Error('TASKS_READ_FAILED: ' + tasksError.message);
    if (appointmentsError) throw new Error('APPOINTMENTS_READ_FAILED: ' + appointmentsError.message);
    if (casesError) throw new Error('CASES_READ_FAILED: ' + casesError.message);
    if (documentRequestsError) throw new Error('DOCUMENTS_READ_FAILED: ' + documentRequestsError.message);

    // La limite porte sur les commentaires les plus récents, puis l'ordre
    // chronologique aide le modèle à reconstruire correctement la conversation.
    const sourceNotes = (notes ?? []).slice().reverse().map((note) => ({
      id: note.id,
      created_at: note.created_at,
      content: note.content.slice(0, MAX_NOTE_LENGTH),
    }));
    const noteIds = new Set(sourceNotes.map((note) => note.id));
    const apiKey = await readApiKey(workspaceId);

    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'detected_information', 'next_action', 'warnings', 'evidence'],
      properties: {
        summary: { type: 'string' },
        detected_information: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'value', 'confidence', 'note_id', 'category'],
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              note_id: { type: ['string', 'null'] },
              category: {
                type: 'string',
                enum: ['availability', 'blocker', 'insurance', 'vehicle', 'glass', 'gift', 'preference', 'other'],
              },
            },
          },
        },
        next_action: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: [
            'label', 'reason', 'suggested_at', 'priority', 'channel',
            'objective', 'draft_message', 'checklist',
          ],
          properties: {
            label: { type: 'string' },
            reason: { type: 'string' },
            suggested_at: { type: ['string', 'null'] },
            priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] },
            channel: { type: 'string', enum: ['call', 'sms', 'email', 'task', 'none'] },
            objective: { type: 'string' },
            draft_message: { type: ['string', 'null'] },
            checklist: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          },
        },
        warnings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['severity', 'category', 'message', 'note_id'],
            properties: {
              severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
              category: { type: 'string' },
              message: { type: 'string' },
              note_id: { type: ['string', 'null'] },
            },
          },
        },
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['note_id', 'reason'],
            properties: {
              note_id: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    };

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: 'low' },
        store: false,
        max_output_tokens: 1_800,
        instructions: [
          'Tu es un copilote CRM pour un centre de remplacement de vitrage automobile.',
          'Réponds uniquement en français et uniquement à partir des données fournies.',
          'N invente aucune information. Une absence doit rester une absence.',
          'Les commentaires originaux sont des sources immuables : ne propose jamais de les réécrire.',
          'Ta réponse doit aider un conseiller à convertir le dossier sans perdre le client.',
          'Repère les disponibilités, objections, blocages, assurance, véhicule, vitrage, cadeau, documents, rendez-vous et prochaine action.',
          'Compare les champs structurés avec les notes, communications, tâches, rendez-vous et documents pour signaler les contradictions.',
          'Classe urgent uniquement ce qui doit être traité aujourd hui ou met concrètement le dossier en risque.',
          'La prochaine action doit être unique, concrète, datée lorsque les données permettent de proposer une date, et avoir un objectif mesurable.',
          'Propose un court brouillon de message seulement pour un SMS ou un e-mail. Il doit rester prudent et ne promettre aucune prise en charge.',
          'La checklist doit contenir au plus cinq vérifications directement utiles pendant cette action.',
          'Ne décide jamais d un changement de statut et ne donne aucun conseil juridique ou assurantiel.',
          'Chaque fait provenant d une note doit référencer exactement son note_id.',
          'Une alerte provenant d une note doit elle aussi référencer exactement son note_id.',
        ].join(' '),
        input: JSON.stringify({
          current_time: new Date().toISOString(),
          lead,
          notes: sourceNotes,
          recent_communications: communications ?? [],
          open_tasks: (tasks ?? []).filter(
            (task) => task.status !== 'done' && task.status !== 'cancelled',
          ),
          recent_appointments: appointments ?? [],
          cases: cases ?? [],
          document_requests: documentRequests ?? [],
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'lead_analysis',
            strict: true,
            schema,
          },
        },
      }),
    });

    const responsePayload = await openAiResponse.json() as Record<string, unknown>;
    if (!openAiResponse.ok) {
      const apiError = asObject(responsePayload.error);
      const apiMessage = typeof apiError.message === 'string'
        ? apiError.message
        : 'HTTP ' + openAiResponse.status;
      throw new Error('OPENAI_FAILED: ' + apiMessage);
    }

    const rawText = responseText(responsePayload);
    if (!rawText) throw new Error('OPENAI_EMPTY_RESPONSE');
    const analysis = JSON.parse(rawText) as Record<string, unknown>;
    const evidence = Array.isArray(analysis.evidence)
      ? analysis.evidence.filter((item) => {
          const noteId = asObject(item).note_id;
          return typeof noteId === 'string' && noteIds.has(noteId);
        })
      : [];
    const detectedInformation = Array.isArray(analysis.detected_information)
      ? analysis.detected_information.map((item) => {
          const entry = asObject(item);
          return typeof entry.note_id === 'string' && !noteIds.has(entry.note_id)
            ? { ...entry, note_id: null }
            : entry;
      })
      : [];
    const warnings = Array.isArray(analysis.warnings)
      ? analysis.warnings.map((item) => {
          const entry = asObject(item);
          return typeof entry.note_id === 'string' && !noteIds.has(entry.note_id)
            ? { ...entry, note_id: null }
            : entry;
        })
      : [];
    const usage = asObject(responsePayload.usage);
    const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
    const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
    const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : null;
    const estimatedCost = inputTokens === null || outputTokens === null
      ? null
      : (
          inputTokens * INPUT_USD_PER_MILLION
          + outputTokens * OUTPUT_USD_PER_MILLION
        ) / 1_000_000;

    const row = {
      workspace_id: workspaceId,
      lead_id: leadId,
      requested_by: userId,
      model: MODEL,
      summary: typeof analysis.summary === 'string' ? analysis.summary : '',
      detected_information: detectedInformation,
      next_action: analysis.next_action ?? null,
      warnings,
      evidence,
      source_notes_count: sourceNotes.length,
      source_latest_note_at: sourceNotes.at(-1)?.created_at ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
    };
    const { data: insight, error: insertError } = await adminClient
      .from('lead_ai_insights')
      .insert(row)
      .select('*')
      .single();
    if (insertError) throw new Error('INSIGHT_WRITE_FAILED: ' + insertError.message);

    const nextAction = asObject(analysis.next_action);
    const priority = typeof nextAction.priority === 'string' ? nextAction.priority : 'normal';
    const hasCriticalWarning = warnings.some(
      (warning) => asObject(warning).severity === 'critical',
    );
    if (priority === 'urgent' || priority === 'high' || hasCriticalWarning) {
      try {
        const targetUserId = typeof lead.assigned_user_id === 'string'
          ? lead.assigned_user_id
          : userId;
        const link = '/interventions/' + leadId;
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: existingAlert } = await adminClient
          .from('notifications')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', targetUserId)
          .eq('type', 'ai')
          .eq('link', link)
          .eq('read', false)
          .gte('created_at', since)
          .limit(1)
          .maybeSingle();
        if (!existingAlert) {
          await adminClient.from('notifications').insert({
            workspace_id: workspaceId,
            user_id: targetUserId,
            title: 'Copilote : action prioritaire',
            body: 'Une analyse a détecté une action importante à vérifier dans le CRM.',
            type: 'ai',
            link,
          });
        }
      } catch (notificationError) {
        console.warn('AI_NOTIFICATION_FAILED', notificationError);
      }
    }

    return jsonResponse({ insight });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED'
      ? 401
      : message === 'FORBIDDEN'
        ? 403
        : message === 'OPENAI_NOT_CONFIGURED'
          ? 503
          : 500;
    return jsonResponse({ error: message }, status);
  }
});
