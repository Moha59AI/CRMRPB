import { supabase } from '@/lib/supabase';
import type { Lead, WebhookEndpoint, WebhookEvent } from '@/types';

export async function fetchLeads(params: {
  search?: string;
  source?: string;
  metaFormId?: string;
}): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.search) {
    const s = params.search.trim();
    query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`);
  }

  if (params.source && params.source !== 'all') {
    query = query.eq('source', params.source);
  }

  if (params.metaFormId && params.metaFormId !== 'all') {
    query = query.eq('meta_form_id', params.metaFormId);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    throw new Error(error.message);
  }

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
  if (lead.excludeId) {
    query = query.neq('id', lead.excludeId);
  }

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

export async function fetchWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as WebhookEndpoint[]) ?? [];
}

export async function createWebhookEndpoint(name: string, provider: string): Promise<{ error: string | null; endpoint?: WebhookEndpoint }> {
  const profile = await supabase.auth.getUser();
  const userId = profile.data.user?.id;

  const { data: profileData } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();

  const workspaceId = profileData?.workspace_id;
  if (!workspaceId) return { error: 'Unable to determine workspace' };

  const endpointKey = crypto.randomUUID().replace(/-/g, '');

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      workspace_id: workspaceId,
      name,
      provider,
      endpoint_key: endpointKey,
      direction: 'inbound',
      enabled: true,
    })
    .select('*')
    .maybeSingle();

  if (error) return { error: error.message };
  return { error: null, endpoint: data as WebhookEndpoint };
}

export async function toggleWebhookEndpoint(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('webhook_endpoints')
    .update({ enabled })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteWebhookEndpoint(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('webhook_endpoints')
    .delete()
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function fetchWebhookEventsForEndpoint(endpointId: string): Promise<WebhookEvent[]> {
  const { data, error } = await supabase
    .from('webhook_events')
    .select('*')
    .eq('endpoint_id', endpointId)
    .order('received_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data as WebhookEvent[]) ?? [];
}

export async function reprocessWebhookEvent(eventId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('webhook_events')
    .update({ processing_status: 'pending', error_message: null })
    .eq('id', eventId);
  return { error: error?.message ?? null };
}
