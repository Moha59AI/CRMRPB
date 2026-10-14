// Dossiers vitrage, documents et SAV

import { supabase } from '@/lib/supabase';
import type { WindscreenCase, CaseDocument, AfterSalesCase } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchCases(params: {
  search?: string;
  status?: string;
  assignedUserId?: string;
}): Promise<WindscreenCase[]> {
  let query = supabase.from('windscreen_cases').select('*').order('created_at', { ascending: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  if (params.search) {
    const s = params.search.trim();
    query = query.or(`case_number.ilike.%${s}%,internal_notes.ilike.%${s}%`);
  }
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as WindscreenCase[]) ?? [];
}

/**
 * Historique Glass Onify complet.
 *
 * Le module Glass ne doit ni afficher les anciens dossiers locaux, ni couper
 * silencieusement la liste au 200e resultat. La pagination continue jusqu'a
 * epuisement, avec l'identifiant Onify comme preuve d'origine.
 */
export async function fetchGlassCases(params: {
  search?: string;
  status?: string;
  assignedUserId?: string;
}): Promise<WindscreenCase[]> {
  const pageSize = 1000;
  const all: WindscreenCase[] = [];
  const search = params.search?.trim().replace(/[,()*\\]/g, ' ').trim() ?? '';

  let start = 0;
  while (true) {
    let query = supabase
      .from('windscreen_cases')
      .select('*')
      .not('onify_glass_case_id', 'is', null)
      .order('onify_updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (params.status && params.status !== 'all') query = query.eq('status', params.status);
    if (params.assignedUserId && params.assignedUserId !== 'all') {
      query = query.eq('assigned_user_id', params.assignedUserId);
    }
    if (search) {
      query = query.or(
        `case_number.ilike.%${search}%,onify_reference.ilike.%${search}%,`
        + `onify_vehicle_registration.ilike.%${search}%,onify_vehicle_make.ilike.%${search}%,`
        + `onify_vehicle_model.ilike.%${search}%,onify_insurer_name.ilike.%${search}%`,
      );
    }

    const { data, error } = await query.range(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data as WindscreenCase[]) ?? [];
    if (page.length === 0) break;
    all.push(...page);
    start += page.length;
    if (page.length < pageSize) break;
  }

  return all;
}

export async function fetchCaseById(id: string): Promise<WindscreenCase | null> {
  const { data, error } = await supabase
    .from('windscreen_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WindscreenCase | null;
}

/** Dossier vitrage le plus recent rattache a une intervention commerciale. */
export async function fetchCaseByLeadId(leadId: string): Promise<WindscreenCase | null> {
  const { data, error } = await supabase
    .from('windscreen_cases')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WindscreenCase | null;
}

/**
 * Dossier Glass Onify reel rattache au lead.
 *
 * Un ancien dossier cree localement ne doit jamais faire croire que le passage
 * dans Onify a eu lieu : l'identifiant partenaire est donc obligatoire.
 */
export async function fetchOnifyGlassCaseByLeadId(leadId: string): Promise<WindscreenCase | null> {
  const { data, error } = await supabase
    .from('windscreen_cases')
    .select('*')
    .eq('lead_id', leadId)
    .not('onify_glass_case_id', 'is', null)
    .order('onify_updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WindscreenCase | null;
}

export async function createCase(c: Partial<WindscreenCase>): Promise<{ error: string | null; caseData: WindscreenCase | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('windscreen_cases')
    .insert({ ...c, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, caseData: null };
  return { error: null, caseData: data as WindscreenCase };
}

export async function updateCase(id: string, updates: Partial<WindscreenCase>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('windscreen_cases').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

// ============ CASE_DOCUMENTS ============

export async function fetchCaseDocuments(caseId: string): Promise<CaseDocument[]> {
  const { data, error } = await supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CaseDocument[]) ?? [];
}

export async function toggleCaseDocument(id: string, uploaded: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('case_documents')
    .update({ uploaded, uploaded_at: uploaded ? new Date().toISOString() : null })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function createCaseDocument(doc: Partial<CaseDocument>): Promise<{ error: string | null }> {
  const wsId = await getWorkspaceId();
  const { error } = await supabase
    .from('case_documents')
    .insert({ ...doc, workspace_id: wsId });
  return { error: error?.message ?? null };
}

export async function fetchAfterSalesCases(params: { status?: string }): Promise<AfterSalesCase[]> {
  let query = supabase.from('after_sales_cases').select('*').order('created_at', { ascending: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as AfterSalesCase[]) ?? [];
}

export async function createAfterSalesCase(a: Partial<AfterSalesCase>): Promise<{ error: string | null; caseData: AfterSalesCase | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('after_sales_cases')
    .insert({ ...a, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, caseData: null };
  return { error: null, caseData: data as AfterSalesCase };
}

export async function updateAfterSalesCase(id: string, updates: Partial<AfterSalesCase>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('after_sales_cases').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}
