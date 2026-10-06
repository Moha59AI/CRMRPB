// Itinéraire routier réel, via OpenRouteService
//
// La clé OpenRouteService ne quitte jamais le serveur. Le navigateur envoie
// seulement les coordonnées d'arrivée : le point de départ est lu ici, dans
// `travel_settings`, pour que personne ne puisse faire calculer un trajet
// depuis un point arbitraire sur notre quota.
//
// Le géocodage n'est pas de son ressort. Les coordonnées viennent de la Base
// Adresse Nationale, déjà enregistrées sur la fiche. Cette fonction prend
// deux points et rend une route.
//
// Documentation : https://openrouteservice.org/dev/#/api-docs/v2/directions

import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';
const PROFIL_PAR_DEFAUT = 'driving-car';
const PROFILS_ACCEPTES = ['driving-car', 'driving-hgv'];

// OpenRouteService répond en deux ou trois secondes sur un trajet régional.
// Au-delà de quinze, mieux vaut rendre la main : la fiche doit s'afficher.
const DELAI_MS = 15_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Codes rendus au navigateur.
 *
 * Un code plutôt qu'un message : la fiche doit pouvoir distinguer « réessayez
 * dans un instant » de « prévenez un administrateur », et c'est elle qui parle
 * français à l'utilisateur.
 */
type Echec =
  | 'NON_AUTHENTIFIE'
  | 'PROFIL_INTROUVABLE'
  | 'DEPART_NON_CONFIGURE'
  | 'COORDONNEES_MANQUANTES'
  | 'CLE_ABSENTE'
  | 'CLE_INVALIDE'
  | 'QUOTA_DEPASSE'
  | 'AUCUNE_ROUTE'
  | 'DELAI_DEPASSE'
  | 'REPONSE_INVALIDE'
  | 'SERVICE_INDISPONIBLE';

class EchecTrajet extends Error {
  constructor(public readonly code: Echec, public readonly statut = 400) {
    super(code);
  }
}

/** Cinq décimales valent environ un mètre : la clé de cache s'arrête là. */
function arrondirCoordonnee(valeur: number): number {
  return Number(valeur.toFixed(5));
}

function arrondirMontant(valeur: number): number {
  return Number(valeur.toFixed(2));
}

function estCoordonnee(valeur: unknown, max: number): valeur is number {
  return typeof valeur === 'number' && Number.isFinite(valeur) && Math.abs(valeur) <= max;
}

async function identifier(req: Request): Promise<{ workspaceId: string }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) throw new EchecTrajet('NON_AUTHENTIFIE', 401);

  const { data: profile } = await adminClient
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.workspace_id) throw new EchecTrajet('PROFIL_INTROUVABLE', 403);

  return { workspaceId: profile.workspace_id as string };
}

interface Bareme {
  fuel_price_per_liter: number;
  consumption_l_per_100km: number;
  vehicle_cost_per_km: number;
  labour_cost_per_hour: number;
}

/**
 * Les mêmes règles d'arrondi que le navigateur.
 *
 * Les montants se calculent sur les valeurs affichées : une fiche qui annonce
 * « 36,8 km » puis « 7,37 € » à 0,20 €/km fait douter de tout le reste.
 */
function calculerCouts(distanceM: number, dureeS: number, bareme: Bareme) {
  const distanceAllerKm = Number((distanceM / 1000).toFixed(1));
  const distanceAllerRetourKm = Number((distanceAllerKm * 2).toFixed(1));
  const tempsAllerMin = Math.round(dureeS / 60);
  const tempsAllerRetourMin = tempsAllerMin * 2;

  const carburant = arrondirMontant(
    ((distanceAllerRetourKm * bareme.consumption_l_per_100km) / 100)
      * bareme.fuel_price_per_liter,
  );
  const vehicule = arrondirMontant(distanceAllerRetourKm * bareme.vehicle_cost_per_km);
  const temps = arrondirMontant((tempsAllerRetourMin / 60) * bareme.labour_cost_per_hour);

  return {
    fuel_cost: carburant,
    vehicle_cost: vehicule,
    labour_cost: temps,
    total_cost: arrondirMontant(carburant + vehicule + temps),
  };
}

interface ReponseORS {
  features?: {
    geometry?: { coordinates?: unknown };
    properties?: { summary?: { distance?: unknown; duration?: unknown } };
  }[];
  error?: { code?: number; message?: string } | string;
}

/**
 * Appel à OpenRouteService.
 *
 * `geometry_simplify` allège le tracé : sans lui, un aller de trente
 * kilomètres revient avec plus d'un millier de points, qu'on stockerait et
 * renverrait à chaque ouverture de fiche pour un trait identique à l'œil.
 */
async function demanderItineraire(
  cle: string,
  profil: string,
  depart: [number, number],
  arrivee: [number, number],
): Promise<{ distanceM: number; dureeS: number; geometrie: [number, number][] | null }> {
  let reponse: Response;
  try {
    reponse = await fetch(`${ORS_BASE}/${profil}/geojson`, {
      method: 'POST',
      headers: {
        Authorization: cle,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json',
      },
      body: JSON.stringify({
        coordinates: [depart, arrivee],
        instructions: false,
        geometry_simplify: true,
        units: 'm',
      }),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (erreur) {
    const nom = (erreur as Error)?.name;
    if (nom === 'TimeoutError' || nom === 'AbortError') {
      throw new EchecTrajet('DELAI_DEPASSE', 504);
    }
    throw new EchecTrajet('SERVICE_INDISPONIBLE', 502);
  }

  if (reponse.status === 401 || reponse.status === 403) {
    throw new EchecTrajet('CLE_INVALIDE', 502);
  }
  if (reponse.status === 429) {
    throw new EchecTrajet('QUOTA_DEPASSE', 502);
  }

  let charge: ReponseORS;
  try {
    charge = (await reponse.json()) as ReponseORS;
  } catch {
    throw new EchecTrajet('REPONSE_INVALIDE', 502);
  }

  if (!reponse.ok) {
    // 2009/2010 : aucun point routable à proximité, ou pas de route entre les
    // deux. Ce n'est pas une panne, c'est une réponse — une île, une adresse
    // mal placée. Elle se dit autrement.
    const code = typeof charge.error === 'object' ? charge.error?.code : null;
    if (code === 2009 || code === 2010 || reponse.status === 404) {
      throw new EchecTrajet('AUCUNE_ROUTE', 422);
    }
    throw new EchecTrajet('SERVICE_INDISPONIBLE', 502);
  }

  const premier = charge.features?.[0];
  const resume = premier?.properties?.summary;
  const distance = resume?.distance;
  const duree = resume?.duration;

  if (typeof distance !== 'number' || typeof duree !== 'number') {
    throw new EchecTrajet('REPONSE_INVALIDE', 502);
  }

  const brut = premier?.geometry?.coordinates;
  const geometrie = Array.isArray(brut)
    ? brut.filter((point): point is [number, number] =>
      Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number')
    : null;

  return {
    distanceM: Math.round(distance),
    dureeS: Math.round(duree),
    geometrie: geometrie && geometrie.length > 1 ? geometrie : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ code: 'METHODE_NON_AUTORISEE' }, 405);

  try {
    const { workspaceId } = await identifier(req);

    const corps = await req.json().catch(() => ({})) as {
      arrivee?: { latitude?: unknown; longitude?: unknown; label?: unknown };
      profil?: unknown;
      force?: unknown;
    };

    const latArrivee = corps.arrivee?.latitude;
    const lonArrivee = corps.arrivee?.longitude;
    if (!estCoordonnee(latArrivee, 90) || !estCoordonnee(lonArrivee, 180)) {
      throw new EchecTrajet('COORDONNEES_MANQUANTES', 422);
    }

    const profil = typeof corps.profil === 'string' && PROFILS_ACCEPTES.includes(corps.profil)
      ? corps.profil
      : PROFIL_PAR_DEFAUT;
    const force = corps.force === true;

    const { data: reglages } = await adminClient
      .from('travel_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!reglages
      || !estCoordonnee(reglages.depart_latitude, 90)
      || !estCoordonnee(reglages.depart_longitude, 180)) {
      throw new EchecTrajet('DEPART_NON_CONFIGURE', 422);
    }

    const bareme: Bareme = {
      fuel_price_per_liter: Number(reglages.fuel_price_per_liter),
      consumption_l_per_100km: Number(reglages.consumption_l_per_100km),
      vehicle_cost_per_km: Number(reglages.vehicle_cost_per_km),
      labour_cost_per_hour: Number(reglages.labour_cost_per_hour),
    };

    const cle = {
      workspace_id: workspaceId,
      profile: profil,
      depart_latitude: arrondirCoordonnee(reglages.depart_latitude),
      depart_longitude: arrondirCoordonnee(reglages.depart_longitude),
      arrivee_latitude: arrondirCoordonnee(latArrivee),
      arrivee_longitude: arrondirCoordonnee(lonArrivee),
    };

    // Le cache court-circuite l'appel externe, sauf demande explicite de
    // recalcul : c'est le bouton « Recalculer le trajet » de la fiche.
    if (!force) {
      const { data: connu } = await adminClient
        .from('travel_routes')
        .select('*')
        .match(cle)
        .maybeSingle();
      if (connu) return jsonResponse({ trajet: connu, origine: 'cache' });
    }

    const cleApi = Deno.env.get('OPENROUTESERVICE_API_KEY')?.trim();
    if (!cleApi) throw new EchecTrajet('CLE_ABSENTE', 503);

    const itineraire = await demanderItineraire(
      cleApi,
      profil,
      [cle.depart_longitude, cle.depart_latitude],
      [cle.arrivee_longitude, cle.arrivee_latitude],
    );

    const ligne = {
      ...cle,
      depart_label: [
        reglages.depart_label,
        reglages.depart_address,
      ].find((v) => typeof v === 'string' && v.trim()) ?? null,
      arrivee_label: typeof corps.arrivee?.label === 'string' && corps.arrivee.label.trim()
        ? corps.arrivee.label.trim().slice(0, 300)
        : null,
      distance_m: itineraire.distanceM,
      duration_s: itineraire.dureeS,
      geometry: itineraire.geometrie,
      ...bareme,
      ...calculerCouts(itineraire.distanceM, itineraire.dureeS, bareme),
      calculated_at: new Date().toISOString(),
    };

    const { data: enregistre, error: erreurEcriture } = await adminClient
      .from('travel_routes')
      .upsert(ligne, {
        onConflict:
          'workspace_id,profile,depart_latitude,depart_longitude,arrivee_latitude,arrivee_longitude',
      })
      .select('*')
      .maybeSingle();

    // Une écriture ratée ne doit pas perdre un calcul déjà payé : on rend le
    // résultat, la prochaine ouverture le recalculera.
    if (erreurEcriture) {
      return jsonResponse({ trajet: ligne, origine: 'calcul', stocke: false });
    }

    return jsonResponse({ trajet: enregistre ?? ligne, origine: 'calcul', stocke: true });
  } catch (erreur) {
    if (erreur instanceof EchecTrajet) {
      return jsonResponse({ code: erreur.code }, erreur.statut);
    }
    return jsonResponse({ code: 'SERVICE_INDISPONIBLE' }, 502);
  }
});
