// Notes, activites, communications et notifications

import { supabase } from '@/lib/supabase';
import type { Note, Activity, Communication, SmsTemplate, Notification } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchNotes(params: { leadId?: string; caseId?: string; contactId?: string }): Promise<Note[]> {
  let query = supabase.from('notes').select('*').order('created_at', { ascending: false });
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  if (params.contactId) query = query.eq('contact_id', params.contactId);
  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  return (data as Note[]) ?? [];
}

export async function createNote(note: Partial<Note>): Promise<{ error: string | null; note: Note | null }> {
  const wsId = await getWorkspaceId();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('notes')
    .insert({ ...note, workspace_id: wsId, user_id: userData.user?.id ?? null })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, note: null };
  return { error: null, note: data as Note };
}

export async function fetchActivities(params: { limit?: number }): Promise<Activity[]> {
  let query = supabase.from('activities').select('*').order('created_at', { ascending: false });
  if (params.limit) query = query.limit(params.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Activity[]) ?? [];
}

export async function createActivity(activity: Partial<Activity>): Promise<void> {
  const wsId = await getWorkspaceId();
  const { data: userData } = await supabase.auth.getUser();
  await supabase
    .from('activities')
    .insert({ ...activity, workspace_id: wsId, user_id: userData.user?.id ?? null });
}

export async function fetchCommunications(params: {
  leadId?: string;
  caseId?: string;
  contactId?: string;
  type?: string;
}): Promise<Communication[]> {
  let query = supabase.from('communications').select('*').order('created_at', { ascending: false });
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  if (params.contactId) query = query.eq('contact_id', params.contactId);
  if (params.type && params.type !== 'all') query = query.eq('type', params.type);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Communication[]) ?? [];
}

export async function createCommunication(comm: Partial<Communication>): Promise<{ error: string | null; comm: Communication | null }> {
  const wsId = await getWorkspaceId();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('communications')
    .insert({ ...comm, workspace_id: wsId, user_id: userData.user?.id ?? null, provider: 'demo' })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, comm: null };
  return { error: null, comm: data as Communication };
}

// ============ SMS_TEMPLATES ============

export async function fetchSmsTemplates(): Promise<SmsTemplate[]> {
  const { data, error } = await supabase
    .from('sms_templates')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as SmsTemplate[]) ?? [];
}

export async function createSmsTemplate(name: string, content: string, category: string): Promise<{ error: string | null }> {
  const wsId = await getWorkspaceId();
  const { error } = await supabase
    .from('sms_templates')
    .insert({ name, content, category, workspace_id: wsId });
  return { error: error?.message ?? null };
}

export async function fetchNotifications(): Promise<Notification[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data as Notification[]) ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}
