// Cadences de relance
//
// Les delais vivaient dans un CASE au coeur de la vue `v_relances`. C'est
// pourtant le reglage qui agit le plus directement sur les conversions, et
// celui qu'on veut essayer plusieurs fois avant de trancher.
//
// Les conversions d'intervalle se font en base : PostgREST rend un `interval`
// tantot « 1 day », tantot « 02:00:00 », et le parser ici serait fragile pour
// rien.

import { supabase } from '@/lib/supabase';
import type { LeadStatus } from '@/types';

export interface Cadence {
  statut: LeadStatus;
  /** Nombre de tentatives a partir duquel la ligne s'applique. */
  tentative_min: number;
  /** null quand le lead sort de la file. */
  delai_minutes: number | null;
  sort_de_file: boolean;
}

export async function fetchCadences(): Promise<Cadence[]> {
  const { data, error } = await supabase.rpc('lire_cadences');
  if (error) throw new Error(error.message);
  return (data ?? []) as Cadence[];
}

/** `minutes` a null signifie « sort de la file ». */
export async function definirCadence(
  statut: LeadStatus,
  tentativeMin: number,
  minutes: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('definir_cadence', {
    p_statut: statut,
    p_tentative_min: tentativeMin,
    p_minutes: minutes,
  });
  if (error) throw new Error(error.message);
}

export async function reinitialiserCadences(): Promise<void> {
  const { error } = await supabase.rpc('reinitialiser_cadences');
  if (error) throw new Error(error.message);
}

// ============ AFFICHAGE ============

/**
 * Duree lisible.
 *
 * On ne convertit pas 90 minutes en « 1 h 30 » mais en « 1 h 30 min » : sur un
 * ecran de reglages, l'unite doit rester explicite pour qu'on sache dans quoi
 * on saisit.
 */
export function formaterDelai(minutes: number | null): string {
  if (minutes === null) return 'Sort de la file';
  if (minutes === 0) return 'Immédiat';

  const jours = Math.floor(minutes / 1440);
  const heures = Math.floor((minutes % 1440) / 60);
  const reste = minutes % 60;

  const parts: string[] = [];
  if (jours > 0) parts.push(`${jours} j`);
  if (heures > 0) parts.push(`${heures} h`);
  if (reste > 0) parts.push(`${reste} min`);

  return parts.join(' ');
}

export type Unite = 'minutes' | 'heures' | 'jours';

/**
 * Choisit l'unite la plus lisible pour une duree.
 *
 * Afficher « 10 080 minutes » plutot que « 7 jours » rendrait le champ
 * inutilisable : personne ne verifie une cadence en minutes.
 */
export function decomposer(minutes: number | null): { valeur: number; unite: Unite } {
  if (minutes === null || minutes === 0) return { valeur: 0, unite: 'minutes' };
  if (minutes % 1440 === 0) return { valeur: minutes / 1440, unite: 'jours' };
  if (minutes % 60 === 0) return { valeur: minutes / 60, unite: 'heures' };
  return { valeur: minutes, unite: 'minutes' };
}

export function enMinutes(valeur: number, unite: Unite): number {
  if (unite === 'jours') return valeur * 1440;
  if (unite === 'heures') return valeur * 60;
  return valeur;
}
