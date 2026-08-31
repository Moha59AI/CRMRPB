import { supabase } from '@/lib/supabase';
import type { WebhookEndpoint, WebhookEvent } from '@/types';

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
