import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);
const NEGATIVE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

type VehicleInput = {
  make?: unknown;
  model?: unknown;
  force?: unknown;
};

type SketchfabImage = {
  url?: string;
  width?: number;
  height?: number;
};

type SketchfabCandidate = {
  uid?: string;
  name?: string;
  embedUrl?: string;
  viewerUrl?: string;
  likeCount?: number;
  faceCount?: number;
  isAgeRestricted?: boolean;
  license?: { label?: string };
  user?: { displayName?: string; username?: string; profileUrl?: string };
  thumbnails?: { images?: SketchfabImage[] };
};

type CatalogRow = {
  id: string;
  make: string;
  model: string;
  provider: string;
  provider_model_id: string | null;
  status: 'available' | 'unavailable';
  title: string | null;
  embed_url: string | null;
  viewer_url: string | null;
  thumbnail_url: string | null;
  author_name: string | null;
  author_url: string | null;
  license_label: string | null;
  last_checked_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

function text(value: unknown, max = 100): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/gu, ' ');
  return clean && clean.length <= max ? clean : null;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/([\p{L}])([0-9])/gu, '$1 $2')
    .replace(/([0-9])([\p{L}])/gu, '$1 $2')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(' ').filter(Boolean))];
}

function allowedLicense(label: string): boolean {
  const normalized = normalize(label);
  if (normalized.includes('noncommercial')) return false;
  return normalized.startsWith('cc 0')
    || normalized.startsWith('cc0')
    || normalized === 'cc attribution'
    || normalized === 'cc attribution sharealike'
    || normalized === 'free standard';
}

function candidateScore(candidate: SketchfabCandidate, make: string, model: string): number | null {
  const name = text(candidate.name, 200);
  const license = text(candidate.license?.label, 100);
  if (!name || !license || !candidate.uid || !candidate.embedUrl || !candidate.viewerUrl) return null;
  if (candidate.isAgeRestricted || !allowedLicense(license)) return null;

  const makeTokens = tokens(make);
  const modelTokens = tokens(model).filter((token) => !makeTokens.includes(token));
  const candidateTokens = tokens(name);
  if (![...makeTokens, ...modelTokens].every((token) => candidateTokens.includes(token))) return null;

  const target = normalize(`${make} ${model}`);
  const candidateName = normalize(name);
  let score = 600;
  if (candidateName === target) score += 900;
  else if (candidateName.startsWith(target)) score += 500;
  else if (candidateName.includes(target)) score += 350;
  score += Math.min(Number(candidate.likeCount ?? 0), 300);
  if ((candidate.faceCount ?? 0) > 1_000_000) score -= 120;
  if (/\b(concept|police|robot|transformer)\b/u.test(candidateName)) score -= 250;
  return score;
}

function bestThumbnail(candidate: SketchfabCandidate): string | null {
  const images = candidate.thumbnails?.images ?? [];
  return images
    .filter((image) => typeof image.url === 'string')
    .sort((a, b) => Math.abs((a.width ?? 0) - 1024) - Math.abs((b.width ?? 0) - 1024))[0]
    ?.url ?? null;
}

function publicModel(row: CatalogRow | null) {
  if (!row || row.status !== 'available') return null;
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    provider: row.provider,
    providerModelId: row.provider_model_id,
    title: row.title,
    embedUrl: row.embed_url,
    viewerUrl: row.viewer_url,
    thumbnailUrl: row.thumbnail_url,
    authorName: row.author_name,
    authorUrl: row.author_url,
    licenseLabel: row.license_label,
    lastCheckedAt: row.last_checked_at,
  };
}

async function authenticatedUser(req: Request): Promise<boolean> {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/iu, '');
  if (!bearer) return false;
  const { data: { user }, error } = await admin.auth.getUser(bearer);
  if (error || !user) return false;
  const { data: profile } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  return Boolean(profile);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    if (!await authenticatedUser(req)) return json({ error: 'Non autorisé' }, 401);

    const input = await req.json() as VehicleInput;
    const make = text(input.make);
    const model = text(input.model);
    if (!make || !model) return json({ model: null, reason: 'vehicle_incomplete' });

    const makeNormalized = normalize(make);
    const modelNormalized = normalize(model);
    const { data: cached, error: cacheError } = await admin
      .from('vehicle_3d_models')
      .select('*')
      .eq('make_normalized', makeNormalized)
      .eq('model_normalized', modelNormalized)
      .maybeSingle();
    if (cacheError) throw new Error(cacheError.message);

    const cachedRow = cached as CatalogRow | null;
    const cacheAge = cachedRow ? Date.now() - new Date(cachedRow.last_checked_at).getTime() : Infinity;
    if (input.force !== true && cachedRow?.status === 'available') {
      return json({ model: publicModel(cachedRow), cached: true });
    }
    if (input.force !== true && cachedRow?.status === 'unavailable' && cacheAge < NEGATIVE_CACHE_MS) {
      return json({ model: null, cached: true, reason: 'not_found' });
    }

    const query = `${make} ${model}`;
    const url = new URL('https://api.sketchfab.com/v3/search');
    url.searchParams.set('type', 'models');
    url.searchParams.set('q', query);
    url.searchParams.set('downloadable', 'true');
    url.searchParams.set('sort_by', '-likeCount');
    url.searchParams.set('count', '24');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RelaisPareBriseCRM/1.0 https://www.relaisparebrise.fr',
      },
    });
    if (!response.ok) throw new Error(`Base 3D indisponible (${response.status})`);
    const payload = await response.json() as { results?: SketchfabCandidate[] };
    const ranked = (payload.results ?? [])
      .map((candidate) => ({ candidate, score: candidateScore(candidate, make, model) }))
      .filter((item): item is { candidate: SketchfabCandidate; score: number } => item.score != null)
      .sort((a, b) => b.score - a.score);
    const match = ranked[0] ?? null;
    const now = new Date().toISOString();

    if (!match) {
      const { error } = await admin.from('vehicle_3d_models').upsert({
        make,
        model,
        make_normalized: makeNormalized,
        model_normalized: modelNormalized,
        provider: 'sketchfab',
        provider_model_id: null,
        status: 'unavailable',
        title: null,
        embed_url: null,
        viewer_url: null,
        thumbnail_url: null,
        author_name: null,
        author_url: null,
        license_label: null,
        source_query: query,
        match_score: null,
        last_checked_at: now,
      }, { onConflict: 'make_normalized,model_normalized' });
      if (error) throw new Error(error.message);
      return json({ model: null, cached: false, reason: 'not_found' });
    }

    const candidate = match.candidate;
    const { data: saved, error: saveError } = await admin.from('vehicle_3d_models').upsert({
      make,
      model,
      make_normalized: makeNormalized,
      model_normalized: modelNormalized,
      provider: 'sketchfab',
      provider_model_id: candidate.uid,
      status: 'available',
      title: candidate.name,
      embed_url: candidate.embedUrl,
      viewer_url: candidate.viewerUrl,
      thumbnail_url: bestThumbnail(candidate),
      author_name: candidate.user?.displayName ?? candidate.user?.username ?? null,
      author_url: candidate.user?.profileUrl ?? null,
      license_label: candidate.license?.label ?? null,
      source_query: query,
      match_score: match.score,
      last_checked_at: now,
    }, { onConflict: 'make_normalized,model_normalized' }).select('*').single();
    if (saveError) throw new Error(saveError.message);

    return json({ model: publicModel(saved as CatalogRow), cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Vue 3D indisponible : ${message}` }, 502);
  }
});
