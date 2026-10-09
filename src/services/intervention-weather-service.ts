import { supabase } from '@/lib/supabase';

export interface DemandeMeteoIntervention {
  startTime: string;
  ville?: string | null;
  codePostal?: string | null;
  citycode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
export interface MeteoIntervention {
  temperature: number;
  ventKmh: number;
  precipitationMm: number;
  symbole: string;
  lieu: string;
  heurePrevision: string;
}

/**
 * La météo passe par Supabase : le navigateur ne contacte jamais MET Norway
 * directement. La fonction peut ainsi s'identifier comme l'exige le service,
 * limiter les appels et ne transmettre qu'une commune ou des coordonnées
 * volontairement arrondies.
 */
export async function fetchMeteoIntervention(
  demande: DemandeMeteoIntervention,
): Promise<MeteoIntervention | null> {
  const { data, error } = await supabase.functions.invoke('intervention-weather', {
    body: {
      startTime: demande.startTime,
      ville: demande.ville?.trim() || null,
      codePostal: demande.codePostal?.trim() || null,
      citycode: demande.citycode?.trim() || null,
      latitude: arrondirCoordonnee(demande.latitude),
      longitude: arrondirCoordonnee(demande.longitude),
    },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return (data?.forecast as MeteoIntervention | null | undefined) ?? null;
}

/** Deux décimales ≈ 1 km : suffisant pour la météo, pas pour une adresse. */
function arrondirCoordonnee(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

export function cleMeteoIntervention(demande: DemandeMeteoIntervention): string[] {
  return [
    'meteo-intervention',
    demande.startTime.slice(0, 13),
    demande.citycode?.trim() || '',
    demande.codePostal?.trim() || '',
    demande.ville?.trim().toLocaleLowerCase('fr-FR') || '',
    String(arrondirCoordonnee(demande.latitude) ?? ''),
    String(arrondirCoordonnee(demande.longitude) ?? ''),
  ];
}
