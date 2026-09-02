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
  /**
   * `exact` quand la BAN a positionne un numero ou une voie, `approximatif`
   * quand elle n'a su placer que le centre de la commune. Suivre un point
   * approximatif menerait le technicien devant la mairie.
   */
  geo_precision: 'exact' | 'approximatif' | null;
}

export interface CommuneCodePostal {
  nom: string;
  code: string;
  code_postal: string;
  latitude: number | null;
  longitude: number | null;
  population: number;
}

/**
 * Communes correspondant à un code postal français.
 *
 * Certains codes postaux couvrent plusieurs communes. La plus peuplée est
 * placée en premier. La table est embarquée dans le CRM : aucun code postal
 * de client n'est envoyé à un service tiers.
 */
export async function rechercherCommunesParCodePostal(
  codePostal: string,
): Promise<CommuneCodePostal[]> {
  const cp = codePostal.replace(/\D/g, '').slice(0, 5);
  if (!/^\d{5}$/.test(cp)) return [];
  // Le référentiel français est volumineux : il n'est chargé qu'au premier
  // code postal saisi, pas au démarrage de chaque écran du CRM.
  const { POSTAL_CITIES } = await import('@/data/postal-cities');
  return (POSTAL_CITIES[cp] ?? []).map((commune, index, liste) => ({
    nom: commune.name,
    code: commune.citycode,
    code_postal: cp,
    latitude: null,
    longitude: null,
    population: liste.length - index,
  }));
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
    geo_precision: precisionDe(s),
  };
}

/**
 * Fiabilite du point renvoye par la BAN.
 *
 * `municipality` et `locality` ne designent pas une adresse mais un centre de
 * commune ou de lieu-dit : le point est bon pour une vue d'ensemble, pas pour
 * s'y rendre.
 */
export function precisionDe(s: AdresseSuggestion): 'exact' | 'approximatif' | null {
  if (s.latitude == null || s.longitude == null) return null;
  return s.type === 'housenumber' || s.type === 'street' ? 'exact' : 'approximatif';
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
