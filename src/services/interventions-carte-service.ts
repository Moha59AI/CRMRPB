// Interventions a localiser sur la carte
//
// Ce qui se place sur une carte, ce sont les rendez-vous ou quelqu'un doit se
// rendre -- pas le carnet de clients. Un lead « a rappeler » n'a pas de lieu
// d'intervention : l'afficher noierait les deplacements reels dans le bruit.
//
// L'adresse vient du rendez-vous quand elle y est saisie, sinon de la fiche
// du lead. Un rendez-vous peut avoir lieu ailleurs qu'a l'adresse du client --
// sur son lieu de travail, chez un concessionnaire.
//
// Regle sur les coordonnees : un rendez-vous qui porte sa propre adresse
// n'emprunte jamais les coordonnees du lead. Elles decrivent un autre lieu.
// L'infobulle annoncerait une adresse et le lien « Itineraire » enverrait le
// technicien ailleurs. Un point faux est plus dangereux qu'une absence de
// point : il ne se signale pas.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import type { AppointmentStatus } from '@/types';

/** Plafond de chargement. Depasse, la carte le dit au lieu de rogner en silence. */
export const PLAFOND_CARTE = 300;

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

  /**
   * Vrai quand le lieu vient du rendez-vous lui-meme, pas de la fiche du
   * lead. Sert a expliquer pourquoi un point manque : c'est l'adresse du
   * rendez-vous qui reste a localiser, pas celle du client.
   */
  lieu_propre: boolean;
}

export interface ResultatCarte {
  interventions: InterventionCarte[];
  /** Vrai si la periode contient plus d'interventions que le plafond. */
  tronque: boolean;
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
  latitude: number | null;
  longitude: number | null;
  geo_precision: 'exact' | 'approximatif' | null;
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
    intervention_address: string | null;
    intervention_city: string | null;
    intervention_postal_code: string | null;
    intervention_latitude: number | null;
    intervention_longitude: number | null;
    intervention_geo_precision: 'exact' | 'approximatif' | null;
  } | null;
}

const CHAMPS_LEAD =
  'first_name, last_name, phone, vehicle_registration, address, city, postal_code, latitude, longitude, geo_precision, intervention_address, intervention_city, intervention_postal_code, intervention_latitude, intervention_longitude, intervention_geo_precision';

/** Le lieu retenu pour une intervention, adresse et coordonnees coherentes. */
function lieuDe(r: LigneJointe) {
  const l = r.leads;

  // 1. Le rendez-vous porte son propre lieu.
  if (r.address) {
    return {
      adresse: r.address,
      ville: null as string | null,
      code_postal: null as string | null,
      // Ses coordonnees, ou aucune. Jamais celles du lead : autre endroit.
      latitude: r.latitude,
      longitude: r.longitude,
      geo_precision: r.latitude != null ? r.geo_precision : null,
      lieu_propre: true,
    };
  }

  // 2. Le lead declare une adresse d'intervention distincte de son domicile.
  const adresseIntervention = Boolean(
    l?.intervention_address || l?.intervention_city || l?.intervention_postal_code,
  );
  if (adresseIntervention) {
    return {
      adresse: l?.intervention_address ?? null,
      ville: l?.intervention_city ?? null,
      code_postal: l?.intervention_postal_code ?? null,
      latitude: l?.intervention_latitude ?? null,
      longitude: l?.intervention_longitude ?? null,
      geo_precision: l?.intervention_geo_precision ?? null,
      lieu_propre: false,
    };
  }

  // 3. A defaut, le domicile du lead.
  return {
    adresse: l?.address ?? null,
    ville: l?.city ?? null,
    code_postal: l?.postal_code ?? null,
    latitude: l?.latitude ?? null,
    longitude: l?.longitude ?? null,
    geo_precision: l?.geo_precision ?? null,
    lieu_propre: false,
  };
}

export async function fetchInterventionsCarte(params: {
  debut: string;
  fin: string;
  assignedUserId?: string;
}): Promise<ResultatCarte> {
  let requete = supabase
    .from('appointments')
    .select(
      `id, lead_id, title, start_time, end_time, status, assigned_user_id,
       address, latitude, longitude, geo_precision,
       leads(${CHAMPS_LEAD})`,
    )
    .eq('type', 'intervention')
    .gte('start_time', params.debut)
    .lte('start_time', params.fin)
    .order('start_time', { ascending: true });

  if (params.assignedUserId && params.assignedUserId !== 'all') {
    requete = requete.eq('assigned_user_id', params.assignedUserId);
  }

  // Une ligne de plus que le plafond : sa presence signale la troncature.
  const { data, error } = await requete.limit(PLAFOND_CARTE + 1);
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as unknown as LigneJointe[];
  const tronque = lignes.length > PLAFOND_CARTE;

  const interventions = lignes.slice(0, PLAFOND_CARTE).map((r) => {
    const nom = [r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(' ');
    const lieu = lieuDe(r);

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

      ...lieu,
    };
  });

  return { interventions, tronque };
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
  const [parLead, parRendezVous] = await Promise.all([
    compterLeadsDInterventionsNonLocalises(params),
    compterRendezVousNonLocalises(params),
  ]);
  return parLead + parRendezVous;
}

async function compterLeadsDInterventionsNonLocalises(params: {
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

/**
 * Rendez-vous dont l'adresse propre n'a pas encore ete localisee.
 *
 * Ceux-la ne peuvent pas etre rattrapes en geocodant les leads : c'est
 * l'adresse du rendez-vous qui manque de coordonnees.
 */
export async function compterRendezVousNonLocalises(params: {
  debut: string;
  fin: string;
}): Promise<number> {
  const workspaceId = await getWorkspaceId();

  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('type', 'intervention')
    .gte('start_time', params.debut)
    .lte('start_time', params.fin)
    .not('address', 'is', null)
    .is('latitude', null);

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
    // Un rendez-vous qui porte sa propre adresse ne sera pas localise en
    // geocodant son lead : ses coordonnees viennent d'ailleurs.
    .is('address', null)
    .limit(PLAFOND_CARTE);

  if (error) throw new Error(error.message);

  const ids = new Set<string>();
  for (const r of (data ?? []) as { lead_id: string | null }[]) {
    if (r.lead_id) ids.add(r.lead_id);
  }
  return [...ids];
}
