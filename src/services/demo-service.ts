import { supabase } from '@/lib/supabase';

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
