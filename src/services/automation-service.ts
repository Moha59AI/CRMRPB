// Scenarios et campagnes

import { supabase } from '@/lib/supabase';
import type { Workflow, WorkflowRun, Campaign, WorkflowAlertRunResult } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Workflow[]) ?? [];
}

export async function createWorkflow(wf: Partial<Workflow>): Promise<Workflow> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('workflows')
    .insert({ ...wf, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Le scénario n'a pas été créé.");
  return data as Workflow;
}

export async function updateWorkflow(id: string, updates: Partial<Workflow>): Promise<void> {
  const { error } = await supabase.from('workflows').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const { error } = await supabase.from('workflows').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function installWorkflowAlerts(): Promise<number> {
  const { data, error } = await supabase.rpc('installer_workflows_alertes');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function runWorkflowAlertsNow(): Promise<WorkflowAlertRunResult> {
  const { data, error } = await supabase.rpc('executer_workflows_alertes', {
    p_workspace_id: null,
    p_force_log: true,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') {
    throw new Error("Le contrôle des alertes n'a renvoyé aucun résultat.");
  }
  return data as unknown as WorkflowAlertRunResult;
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
