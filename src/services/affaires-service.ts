import { supabase } from '@/lib/supabase';
import type { AffaireVitrage } from '@/types';

/** Affaire transversale correspondant a un dossier Glass precis. */
export async function fetchAffaireByCaseId(caseId: string): Promise<AffaireVitrage | null> {
  const { data, error } = await supabase
    .from('v_affaires_vitrage')
    .select('*')
    .eq('glass_case_id', caseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AffaireVitrage | null;
}

/** Historique des interventions d'un meme contact, sans fusionner ses dossiers. */
export async function fetchAffairesByContactId(contactId: string): Promise<AffaireVitrage[]> {
  const { data, error } = await supabase
    .from('v_affaires_vitrage')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as AffaireVitrage[] | null) ?? [];
}
