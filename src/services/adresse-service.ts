// Base Adresse Nationale (BAN) — service de geocodage de la Geoplateforme
//
// API publique de l'Etat : pas de cle, pas d'inscription, Licence Ouverte 2.0.
// Limite de 50 appels/seconde/IP, au-dela HTTP 429 et blocage de 5 secondes.
//
// L'ancienne api-adresse.data.gouv.fr repond encore mais est annoncee pour
// retrait : tout passe par data.geopf.fr.
//
// Documentation : https://adresse.data.gouv.fr/api-doc/adresse

const BASE = 'https://data.geopf.fr/geocodage';

/** Ce que la BAN sait decrire. `housenumber` est le seul niveau exploitable pour une intervention. */
export type TypeAdresse = 'housenumber' | 'street' | 'locality' | 'municipality';

export interface AdresseSuggestion {
  /** Cle stable pour React, fournie par la BAN. */
  id: string;
  /** Libelle complet, tel qu'on l'affiche : « 12 Rue de Lens 59000 Lille ». */
  label: string;
  numero: string | null;
  rue: string | null;
  code_postal: string | null;
  ville: string | null;
  /** Code INSEE : c'est lui qui identifie la commune sans ambiguite. */
  citycode: string | null;
  /** « 59, Nord, Hauts-de-France » */
  contexte: string | null;
  type: TypeAdresse;
  latitude: number | null;
  longitude: number | null;
  /** Pertinence renvoyee par la BAN, entre 0 et 1. */
  score: number;
}

/** Ce qu'on enregistre en base a partir d'une suggestion choisie. */
export interface AdresseNormalisee {
  address: string | null;
  postal_code: string | null;
  city: string | null;
  citycode: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface OptionsRecherche {
  limite?: number;
  /** Restreint le niveau de detail. Sans valeur, la BAN renvoie tous les niveaux. */
  type?: TypeAdresse;
  /** Filtre sur un code postal exact. */
  codePostal?: string;
  /** Privilegie les resultats proches de ce point, sans les restreindre. */
  autour?: { latitude: number; longitude: number };
  signal?: AbortSignal;
}

interface ReponseBAN {
  features?: {
    geometry?: { coordinates?: [number, number] };
    properties?: Record<string, unknown>;
  }[];
}

function texte(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function convertir(feature: NonNullable<ReponseBAN['features']>[number]): AdresseSuggestion | null {
  const p = feature.properties;
  if (!p) return null;

  const label = texte(p.label);
  const id = texte(p.id) ?? label;
  if (!label || !id) return null;

  const coords = feature.geometry?.coordinates;

  return {
    id,
    label,
    numero: texte(p.housenumber),
    rue: texte(p.street) ?? texte(p.name),
    code_postal: texte(p.postcode),
    ville: texte(p.city),
    citycode: texte(p.citycode),
    contexte: texte(p.context),
    type: (texte(p.type) ?? 'street') as TypeAdresse,
    // La BAN renvoie [longitude, latitude] : l'inverse de l'ordre habituel.
    longitude: Array.isArray(coords) ? coords[0] ?? null : null,
    latitude: Array.isArray(coords) ? coords[1] ?? null : null,
    score: typeof p.score === 'number' ? p.score : 0,
  };
}

/**
 * Recherche d'adresses.
 *
 * Renvoie un tableau vide plutot que de lever quand la requete est trop courte
 * ou annulee : une autocompletion qui jette a chaque frappe est inutilisable.
 * Les vraies erreurs reseau, elles, remontent.
 */
export async function rechercherAdresse(
  requete: string,
  options: OptionsRecherche = {},
): Promise<AdresseSuggestion[]> {
  const q = requete.trim();
  // En dessous de trois caracteres la BAN renvoie du bruit, et c'est autant
  // d'appels pour rien contre une limite de debit partagee par IP.
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    q,
    limit: String(options.limite ?? 6),
    autocomplete: '1',
  });

  if (options.type) params.set('type', options.type);
  if (options.codePostal) params.set('postcode', options.codePostal);
  if (options.autour) {
    params.set('lat', String(options.autour.latitude));
    params.set('lon', String(options.autour.longitude));
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}/search?${params}`, { signal: options.signal });
  } catch (e) {
    // Une frappe suivante annule la precedente : ce n'est pas une panne.
    if (e instanceof DOMException && e.name === 'AbortError') return [];
    throw new Error("Le service d'adresses est injoignable");
  }

  if (reponse.status === 429) {
    throw new Error("Trop de recherches d'adresse d'un coup, réessayez dans quelques secondes");
  }
  if (!reponse.ok) {
    throw new Error(`Le service d'adresses a répondu ${reponse.status}`);
  }

  const donnees = (await reponse.json()) as ReponseBAN;
  return (donnees.features ?? [])
    .map(convertir)
    .filter((s): s is AdresseSuggestion => s !== null);
}

/** Geocodage inverse : ce qui se trouve a ces coordonnees. */
export async function adresseDepuisCoordonnees(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<AdresseSuggestion | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    limit: '1',
  });

  const reponse = await fetch(`${BASE}/reverse?${params}`, { signal });
  if (!reponse.ok) return null;

  const donnees = (await reponse.json()) as ReponseBAN;
  const premiere = donnees.features?.[0];
  return premiere ? convertir(premiere) : null;
}

/**
 * Ce qu'on enregistre pour une suggestion choisie.
 *
 * `address` ne garde que la partie voie : le code postal et la ville ont leurs
 * propres colonnes, les repeter dans l'adresse produirait « 12 Rue de Lens
 * 59000 Lille, 59000 Lille » sur un devis.
 */
export function normaliser(s: AdresseSuggestion): AdresseNormalisee {
  const voie = [s.numero, s.rue].filter(Boolean).join(' ').trim();

  return {
    address: voie || null,
    postal_code: s.code_postal,
    city: s.ville,
    citycode: s.citycode,
    latitude: s.latitude,
    longitude: s.longitude,
  };
}

/** Lien vers un itineraire, pour le technicien qui part sur place. */
export function lienItineraire(a: {
  address?: string | null; postal_code?: string | null; city?: string | null;
  latitude?: number | null; longitude?: number | null;
}): string | null {
  if (a.latitude != null && a.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${a.latitude},${a.longitude}`;
  }

  const complet = [a.address, a.postal_code, a.city].filter(Boolean).join(' ');
  if (!complet) return null;

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(complet)}`;
}
