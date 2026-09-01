// Interventions a localiser sur la carte
//
// Ce qui se place sur une carte, ce sont les rendez-vous ou quelqu'un doit se
// rendre -- pas le carnet de clients. Un lead « a rappeler » n'a pas de lieu
// d'intervention : l'afficher noierait les deplacements reels dans le bruit.
//
// L'adresse vient du rendez-vous quand elle y est saisie, sinon de la fiche
// du lead. Un rendez-vous peut avoir lieu ailleurs qu'a l'adresse du client --
// sur son lieu de travail, chez un concessionnaire.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { AppointmentStatus } from '@/types';

export interface InterventionCarte {
  appointment_id: string;
  lead_id: string | null;
  titre: string;
  debut: string;
  fin: string;
  statut: AppointmentStatus;
  assigned_user_id: string | null;

  client: string | null;
  telephone: string | null;
  immatriculation: string | null;

  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_precision: 'exact' | 'approximatif' | null;
}

interface LigneJointe {
  id: string;
  lead_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  assigned_user_id: string | null;
  address: string | null;
  leads: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    vehicle_registration: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    latitude: number | null;
    longitude: number | null;
    geo_precision: 'exact' | 'approximatif' | null;
  } | null;
}

const CHAMPS_LEAD =
  'first_name, last_name, phone, vehicle_registration, address, city, postal_code, latitude, longitude, geo_precision';

export async function fetchInterventionsCarte(params: {
  debut: string;
  fin: string;
  assignedUserId?: string;
}): Promise<InterventionCarte[]> {
  let requete = supabase
    .from('appointments')
    .select(
      `id, lead_id, title, start_time, end_time, status, assigned_user_id, address,
       leads(${CHAMPS_LEAD})`,
    )
    .eq('type', 'intervention')
    .gte('start_time', params.debut)
    .lte('start_time', params.fin)
    .order('start_time', { ascending: true });

  if (params.assignedUserId && params.assignedUserId !== 'all') {
    requete = requete.eq('assigned_user_id', params.assignedUserId);
  }

  const { data, error } = await requete.limit(300);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as LigneJointe[]).map((r) => {
    const nom = [r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(' ');

    return {
      appointment_id: r.id,
      lead_id: r.lead_id,
      titre: r.title,
      debut: r.start_time,
      fin: r.end_time,
      statut: r.status,
      assigned_user_id: r.assigned_user_id,

      client: nom || null,
      telephone: r.leads?.phone ?? null,
      immatriculation: r.leads?.vehicle_registration ?? null,

      // L'adresse du rendez-vous prime : elle a ete saisie pour ce
      // deplacement-la. Les coordonnees, elles, ne peuvent venir que du lead.
      adresse: r.address ?? r.leads?.address ?? null,
      ville: r.leads?.city ?? null,
      code_postal: r.leads?.postal_code ?? null,
      latitude: r.leads?.latitude ?? null,
      longitude: r.leads?.longitude ?? null,
      geo_precision: r.leads?.geo_precision ?? null,
    };
  });
}

/**
 * Localise les leads qui portent une intervention mais pas de coordonnees.
 *
 * Le perimetre est volontairement etroit : geocoder tout le carnet ferait des
 * centaines d'appels pour des points que personne n'ira voir.
 */
export async function compterInterventionsNonLocalisees(params: {
  debut: string;
  fin: string;
}): Promise<number> {
  const ids = await leadsDInterventions(params);
  if (ids.length === 0) return 0;

  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .is('latitude', null)
    .or('address.not.is.null,city.not.is.null');

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function leadsDInterventions(params: {
  debut: string;
  fin: string;
}): Promise<string[]> {
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from('appointments')
    .select('lead_id')
    .eq('workspace_id', workspaceId)
    .eq('type', 'intervention')
    .gte('start_time', params.debut)
    .lte('start_time', params.fin)
    .not('lead_id', 'is', null)
    .limit(300);

  if (error) throw new Error(error.message);

  const ids = new Set<string>();
  for (const r of (data ?? []) as { lead_id: string | null }[]) {
    if (r.lead_id) ids.add(r.lead_id);
  }
  return [...ids];
}
