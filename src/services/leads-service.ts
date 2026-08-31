// Leads

import { supabase } from '@/lib/supabase';
import type { Lead } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchLeads(params: {
  search?: string;
  source?: string;
  status?: string;
  assignedUserId?: string;
}): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.search) {
    const s = params.search.trim();
    query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%,vehicle_registration.ilike.%${s}%`);
  }
  if (params.source && params.source !== 'all') query = query.eq('source', params.source);
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Lead[]) ?? [];
}

export async function fetchLeadById(id: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Lead | null;
}

export async function updateLeadStatus(id: string, status: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('leads').update({ status }).eq('id', id);
  return { error: error?.message ?? null };
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('leads').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function createLead(lead: Partial<Lead>): Promise<{ error: string | null; lead: Lead | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...lead, workspace_id: wsId, source: lead.source ?? 'manual' })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, lead: null };
  return { error: null, lead: data as Lead };
}

export async function checkDuplicateLead(lead: {
  phone?: string | null;
  email?: string | null;
  vehicle_registration?: string | null;
  excludeId?: string;
}): Promise<{ field: string; count: number }[]> {
  const duplicates: { field: string; count: number }[] = [];
  const conditions: string[] = [];
  if (lead.phone) conditions.push(`phone.eq.${lead.phone}`);
  if (lead.email) conditions.push(`email.eq.${lead.email}`);
  if (lead.vehicle_registration) conditions.push(`vehicle_registration.eq.${lead.vehicle_registration}`);
  if (conditions.length === 0) return duplicates;

  let query = supabase.from('leads').select('id, phone, email, vehicle_registration').or(conditions.join(','));
  if (lead.excludeId) query = query.neq('id', lead.excludeId);

  const { data } = await query;
  if (!data) return duplicates;

  if (lead.phone && data.some((d) => d.phone === lead.phone)) {
    duplicates.push({ field: 'phone', count: data.filter((d) => d.phone === lead.phone).length });
  }
  if (lead.email && data.some((d) => d.email === lead.email)) {
    duplicates.push({ field: 'email', count: data.filter((d) => d.email === lead.email).length });
  }
  if (lead.vehicle_registration && data.some((d) => d.vehicle_registration === lead.vehicle_registration)) {
    duplicates.push({ field: 'vehicle_registration', count: data.filter((d) => d.vehicle_registration === lead.vehicle_registration).length });
  }
  return duplicates;
}

export async function seedDemoLeads(): Promise<{ count: number; error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { count: 0, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.workspace_id) return { count: 0, error: 'No workspace found' };

  const { data, error } = await supabase.rpc('seed_demo_leads', {
    p_workspace_id: profile.workspace_id,
  });

  if (error) return { count: 0, error: error.message };
  return { count: data as number, error: null };
}
