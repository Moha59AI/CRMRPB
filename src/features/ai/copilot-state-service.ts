import { supabase } from '@/lib/supabase';

export type CopilotAlertDisposition = 'done' | 'snoozed' | 'dismissed';

export interface CopilotAlertState {
  alert_key: string;
  status: CopilotAlertDisposition;
  hidden_until: string;
}

export interface CopilotAlertStatesResult {
  available: boolean;
  states: CopilotAlertState[];
}

interface SaveCopilotAlertStateInput {
  workspaceId: string;
  userId: string;
  alertKey: string;
  status: CopilotAlertDisposition;
  hiddenUntil: string;
}

export async function fetchCopilotAlertStates(
  userId: string,
): Promise<CopilotAlertStatesResult> {
  const { data, error } = await supabase
    .from('copilot_alert_states')
    .select('alert_key,status,hidden_until')
    .eq('user_id', userId)
    .gt('hidden_until', new Date().toISOString());

  // Le centre d'action reste consultable avant l'application manuelle de la
  // migration. Seules les actions personnelles sont alors indisponibles.
  if (error?.code === '42P01') return { available: false, states: [] };
  if (error) throw new Error(error.message);
  return {
    available: true,
    states: (data ?? []) as CopilotAlertState[],
  };
}

export async function saveCopilotAlertState(
  input: SaveCopilotAlertStateInput,
): Promise<void> {
  const { error } = await supabase
    .from('copilot_alert_states')
    .upsert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      alert_key: input.alertKey,
      status: input.status,
      hidden_until: input.hiddenUntil,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,user_id,alert_key' });
  if (error) throw new Error(error.message);
}
