// Les interventions, telles qu'on les consulte sur le terrain
//
// Un technicien ouvre le CRM pour savoir ou il va et a quelle heure. Tout
// part donc du rendez-vous lui-meme : son titre porte la plaque, son adresse
// porte le lieu, et ses coordonnees portent le point. Rien de cela ne depend
// d'une jointure, ce qui compte : la politique RLS du technicien lui laisse
// voir tous les rendez-vous de l'atelier, mais pas tous les leads.
//
// Le client et le telephone viennent en plus quand ils sont lisibles. Leur
// absence n'enleve rien a la ligne -- l'adresse et l'heure suffisent a partir.

import { supabase } from '@/lib/supabase';
import type { AppointmentStatus } from '@/types';

/** Plafond de chargement. Au-dela, la periode affichee le dit. */
export const PLAFOND_INTERVENTIONS = 200;

export interface Intervention {
  id: string;
  lead_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
  titre: string;
  debut: string;
  fin: string;
  statut: AppointmentStatus;

  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  /** Code INSEE de la commune du rendez-vous, quand il a été géocodé. */
  citycode: string | null;
  latitude: number | null;
  longitude: number | null;
  /** `approximatif` = centre de commune : on n'y envoie pas quelqu'un. */
  geo_precision: 'exact' | 'approximatif' | null;

  /** Connus seulement si la fiche est lisible par le role courant. */
  client: string | null;
  telephone: string | null;
  immatriculation: string | null;
  /** Marque et modèle, recopiés sur le rendez-vous depuis Onify. */
  vehicule: string | null;
}

interface LigneJointe {
  id: string;
  lead_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  address: string | null;
  citycode: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_precision: 'exact' | 'approximatif' | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_registration: string | null;
  leads: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    vehicle_registration: string | null;
    vehicle_make: string | null;
    vehicle_model: string | null;
    city: string | null;
    postal_code: string | null;
    intervention_city: string | null;
    intervention_postal_code: string | null;
  } | null;
  contacts: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    city: string | null;
    postal_code: string | null;
  } | null;
}

function nomComplet(p: { first_name: string | null; last_name: string | null } | null): string | null {
  if (!p) return null;
  return [p.first_name, p.last_name].map((v) => v?.trim()).filter(Boolean).join(' ') || null;
}

function localisationDepuisAdresse(adresse: string | null): {
  ville: string | null;
  codePostal: string | null;
} {
  const correspondance = adresse?.match(/\b(\d{5})\s+([^,;]+)/u);
  return {
    codePostal: correspondance?.[1] ?? null,
    ville: correspondance?.[2]?.trim() || null,
  };
}

export async function fetchInterventions(params: {
  debut: string;
  fin: string;
}): Promise<{ interventions: Intervention[]; tronque: boolean }> {
  const { data, error } = await supabase
    .from('appointments')
    .select(
      `id, lead_id, contact_id, assigned_user_id, title, start_time, end_time, status,
       address, citycode, latitude, longitude, geo_precision,
       vehicle_make, vehicle_model, vehicle_registration,
       leads(first_name, last_name, phone, vehicle_registration, vehicle_make, vehicle_model, city, postal_code,
             intervention_city, intervention_postal_code),
       contacts(first_name, last_name, phone, city, postal_code)`,
    )
    .eq('type', 'intervention')
    .gte('start_time', params.debut)
    .lte('start_time', params.fin)
    .order('start_time', { ascending: true })
    // Une ligne de plus que le plafond : sa presence signale la troncature.
    .limit(PLAFOND_INTERVENTIONS + 1);

  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as unknown as LigneJointe[];
  const tronque = lignes.length > PLAFOND_INTERVENTIONS;

  const interventions = lignes.slice(0, PLAFOND_INTERVENTIONS).map((r): Intervention => {
    const depuisAdresse = localisationDepuisAdresse(r.address);
    const marque = r.vehicle_make?.trim() || r.leads?.vehicle_make?.trim() || null;
    const modele = r.vehicle_model?.trim() || r.leads?.vehicle_model?.trim() || null;
    return {
      id: r.id,
      lead_id: r.lead_id,
      contact_id: r.contact_id,
      assigned_user_id: r.assigned_user_id,
      titre: r.title,
      debut: r.start_time,
      fin: r.end_time,
      statut: r.status,

      adresse: r.address,
      ville: r.leads?.intervention_city?.trim()
        || r.leads?.city?.trim()
        || r.contacts?.city?.trim()
        || depuisAdresse.ville,
      codePostal: r.leads?.intervention_postal_code?.trim()
        || r.leads?.postal_code?.trim()
        || r.contacts?.postal_code?.trim()
        || depuisAdresse.codePostal,
      citycode: r.citycode,
      latitude: r.latitude,
      longitude: r.longitude,
      geo_precision: r.geo_precision,

      client: nomComplet(r.leads) ?? nomComplet(r.contacts),
      telephone: r.leads?.phone?.trim() || r.contacts?.phone?.trim() || null,
      immatriculation: r.vehicle_registration?.trim()
        || r.leads?.vehicle_registration?.trim()
        || null,
      vehicule: [marque, modele].filter(Boolean).join(' ') || null,
    };
  });

  return { interventions, tronque };
}

/**
 * Change le statut d'une intervention.
 *
 * La politique RLS du technicien ne le laisse modifier que les rendez-vous
 * qui lui sont affectes. L'interface ne propose donc le changement que la ou
 * il aboutira : un bouton qui echoue silencieusement est pire que pas de
 * bouton.
 */
export async function changerStatutIntervention(
  id: string,
  statut: AppointmentStatus,
): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({ status: statut })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
