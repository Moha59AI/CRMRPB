import { supabase, supabaseUrl } from '@/lib/supabase';

export interface AiDetectedInformation {
  label: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  note_id: string | null;
}

export interface AiNextAction {
  label: string;
  reason: string;
  suggested_at: string | null;
}

export interface AiEvidence {
  note_id: string;
  reason: string;
}

export interface LeadAiInsight {
  id: string;
  workspace_id: string;
  lead_id: string;
  requested_by: string | null;
  model: string;
  summary: string;
  detected_information: AiDetectedInformation[];
  next_action: AiNextAction | null;
  warnings: string[];
  evidence: AiEvidence[];
  source_notes_count: number;
  source_latest_note_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
}

interface FunctionErrorPayload {
  error?: string;
}

async function bearerToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session?.access_token) throw new Error('Session expirée, reconnectez-vous');
  return data.session.access_token;
}

async function callAiFunction<T>(
  name: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(supabaseUrl + '/functions/v1/' + name, {
    method,
    headers: {
      Authorization: 'Bearer ' + await bearerToken(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as T & FunctionErrorPayload;
  if (!response.ok) {
    const raw = payload.error || name + ': HTTP ' + response.status;
    if (raw === 'OPENAI_NOT_CONFIGURED') {
      throw new Error('La clé OpenAI doit d’abord être enregistrée dans Réglages > Intégrations > Assistant IA');
    }
    throw new Error(raw);
  }
  return payload;
}

export async function fetchLatestLeadInsight(leadId: string): Promise<LeadAiInsight | null> {
  const { data, error } = await supabase
    .from('lead_ai_insights')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message);
  }
  return data as LeadAiInsight | null;
}

export async function analyzeLead(leadId: string): Promise<LeadAiInsight> {
  const payload = await callAiFunction<{ insight: LeadAiInsight }>(
    'lead-ai-assistant',
    'POST',
    { leadId },
  );
  if (!payload.insight) throw new Error('L’analyse IA n’a retourné aucun résultat');
  return payload.insight;
}

export async function fetchAiSettingsStatus(): Promise<{ configured: boolean; model: string }> {
  return callAiFunction('ai-store-secret', 'GET');
}

export async function storeOpenAiKey(apiKey: string): Promise<void> {
  const payload = await callAiFunction<{ success?: boolean }>(
    'ai-store-secret',
    'POST',
    { apiKey },
  );
  if (!payload.success) throw new Error('La clé OpenAI n’a pas été enregistrée');
}
