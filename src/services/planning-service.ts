// Rendez-vous et taches

import { supabase } from '@/lib/supabase';
import type { Appointment, Task } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchAppointments(params: {
  startDate?: string;
  endDate?: string;
  assignedUserId?: string;
}): Promise<Appointment[]> {
  let query = supabase.from('appointments').select('*').order('start_time', { ascending: true });
  if (params.startDate) query = query.gte('start_time', params.startDate);
  if (params.endDate) query = query.lte('start_time', params.endDate);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Appointment[]) ?? [];
}

export async function createAppointment(appt: Partial<Appointment>): Promise<{ error: string | null; appointment: Appointment | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appt, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, appointment: null };
  return { error: null, appointment: data as Appointment };
}

export async function updateAppointment(id: string, updates: Partial<Appointment>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appointments').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteAppointment(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function fetchTasks(params: {
  status?: string;
  assignedUserId?: string;
  leadId?: string;
  caseId?: string;
}): Promise<Task[]> {
  let query = supabase.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Task[]) ?? [];
}

export async function createTask(task: Partial<Task>): Promise<{ error: string | null; task: Task | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...task, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, task: null };
  return { error: null, task: data as Task };
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tasks').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}
