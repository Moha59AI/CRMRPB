// Scenarios et campagnes

import { supabase } from '@/lib/supabase';
import type { Workflow, WorkflowRun, Campaign } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Workflow[]) ?? [];
}

export async function createWorkflow(wf: Partial<Workflow>): Promise<{ error: string | null; workflow: Workflow | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('workflows')
    .insert({ ...wf, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, workflow: null };
  return { error: null, workflow: data as Workflow };
}

export async function updateWorkflow(id: string, updates: Partial<Workflow>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('workflows').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteWorkflow(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('workflows').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function fetchWorkflowRuns(workflowId: string): Promise<WorkflowRun[]> {
  const { data, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as WorkflowRun[]) ?? [];
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Campaign[]) ?? [];
}

export async function createCampaign(c: Partial<Campaign>): Promise<{ error: string | null; campaign: Campaign | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('campaigns')
    .insert({ ...c, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, campaign: null };
  return { error: null, campaign: data as Campaign };
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('campaigns').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}
