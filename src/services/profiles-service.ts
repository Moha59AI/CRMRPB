// Profils utilisateurs

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('first_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Profile[]) ?? [];
}
