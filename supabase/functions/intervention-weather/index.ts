const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type WeatherInput = {
  startTime?: unknown;
  ville?: unknown;
  codePostal?: unknown;
  citycode?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

type Commune = {
  nom?: string;
  centre?: { coordinates?: [number, number] };
};

type MetSeries = {
  time?: string;
  data?: {
    instant?: {
      details?: {
        air_temperature?: number;
        wind_speed?: number;
        wind_speed_of_gust?: number;
      };
    };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: {
        precipitation_amount?: number;
        probability_of_precipitation?: number;
      };
    };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: {
        precipitation_amount?: number;
        probability_of_precipitation?: number;
      };
    };
  };
};

const NEUF_JOURS = 9 * 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=1800',
    },
  });
}

function texte(value: unknown, max = 120): string | null {
  if (typeof value !== 'string') return null;
  const propre = value.trim();
  return propre && propre.length <= max ? propre : null;
}

function coordonnee(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  // MET Norway refuse cinq décimales ou plus. Deux suffisent à l'échelle d'une commune.
  return Math.round(value * 100) / 100;
}

async function lireCommune(url: URL): Promise<Commune | null> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const data = await response.json() as Commune | Commune[];
  return Array.isArray(data) ? data[0] ?? null : data;
}

async function localiser(input: WeatherInput): Promise<{
  latitude: number;
  longitude: number;
  lieu: string;
} | null> {
  const citycode = texte(input.citycode, 10);
  const codePostal = texte(input.codePostal, 5);
  const ville = texte(input.ville);
  let commune: Commune | null = null;

  if (citycode && /^[0-9A-Z]{5}$/u.test(citycode)) {
    commune = await lireCommune(new URL(
      `https://geo.api.gouv.fr/communes/${encodeURIComponent(citycode)}?fields=nom,centre&format=json&geometry=centre`,
    ));
  }

  if (!commune && codePostal && /^\d{5}$/u.test(codePostal)) {
    const url = new URL('https://geo.api.gouv.fr/communes');
    url.searchParams.set('codePostal', codePostal);
    if (ville) url.searchParams.set('nom', ville);
    url.searchParams.set('fields', 'nom,centre');
    url.searchParams.set('format', 'json');
    url.searchParams.set('geometry', 'centre');
    url.searchParams.set('boost', 'population');
    commune = await lireCommune(url);
  }

  if (!commune && ville) {
    const url = new URL('https://geo.api.gouv.fr/communes');
    url.searchParams.set('nom', ville);
    url.searchParams.set('fields', 'nom,centre');
    url.searchParams.set('format', 'json');
    url.searchParams.set('geometry', 'centre');
    url.searchParams.set('boost', 'population');
    url.searchParams.set('limit', '1');
    commune = await lireCommune(url);
  }

  const centre = commune?.centre?.coordinates;
  if (centre && Number.isFinite(centre[0]) && Number.isFinite(centre[1])) {
    return {
      longitude: Math.round(centre[0] * 10_000) / 10_000,
      latitude: Math.round(centre[1] * 10_000) / 10_000,
      lieu: commune?.nom?.trim() || ville || codePostal || 'Lieu de l’intervention',
    };
  }

  const latitude = coordonnee(input.latitude, -90, 90);
  const longitude = coordonnee(input.longitude, -180, 180);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude, lieu: ville || codePostal || 'Lieu de l’intervention' };
}

function plusProche(series: MetSeries[], cible: number): MetSeries | null {
  let meilleure: MetSeries | null = null;
  let ecart = Number.POSITIVE_INFINITY;
  for (const point of series) {
    const heure = point.time ? new Date(point.time).getTime() : Number.NaN;
    if (!Number.isFinite(heure)) continue;
    const distance = Math.abs(heure - cible);
    if (distance < ecart) {
      meilleure = point;
      ecart = distance;
    }
  }
  // Une prévision trop éloignée serait trompeuse.
  return ecart <= 3 * 60 * 60 * 1000 ? meilleure : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const input = await req.json() as WeatherInput;
    const startTime = texte(input.startTime, 40);
    const cible = startTime ? new Date(startTime).getTime() : Number.NaN;
    if (!Number.isFinite(cible)) return json({ error: 'Date d’intervention invalide' }, 400);

    const maintenant = Date.now();
    if (cible < maintenant - 60 * 60 * 1000 || cible > maintenant + NEUF_JOURS) {
      return json({ forecast: null });
    }

    const lieu = await localiser(input);
    if (!lieu) return json({ forecast: null });

    const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
    url.searchParams.set('lat', lieu.latitude.toFixed(4));
    url.searchParams.set('lon', lieu.longitude.toFixed(4));

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Identification demandée par les CGU MET Norway. Aucun secret requis.
        'User-Agent': 'RelaisPareBriseCRM/1.0 https://www.relaisparebrise.fr',
      },
    });
    if (!response.ok) throw new Error(`MET Norway ${response.status}`);

    const payload = await response.json() as {
      properties?: { timeseries?: MetSeries[] };
    };
    const point = plusProche(payload.properties?.timeseries ?? [], cible);
    const details = point?.data?.instant?.details;
    const periode = point?.data?.next_1_hours ?? point?.data?.next_6_hours;
    if (!point?.time || details?.air_temperature == null) return json({ forecast: null });

    return json({
      forecast: {
        temperature: Math.round(details.air_temperature * 10) / 10,
        ventKmh: Math.round((details.wind_speed ?? 0) * 3.6),
        rafaleKmh: Math.round((details.wind_speed_of_gust ?? details.wind_speed ?? 0) * 3.6),
        precipitationMm: Math.round((periode?.details?.precipitation_amount ?? 0) * 10) / 10,
        probabilitePluie: typeof periode?.details?.probability_of_precipitation === 'number'
          ? Math.round(periode.details.probability_of_precipitation)
          : null,
        symbole: periode?.summary?.symbol_code ?? 'clearsky_day',
        lieu: lieu.lieu,
        heurePrevision: point.time,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Météo indisponible : ${message}` }, 502);
  }
});
