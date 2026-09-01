import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rechercherAdresse, normaliser, lienItineraire, precisionDe, type AdresseSuggestion,
} from './adresse-service';

// Reponse reelle de la Geoplateforme, copiee d'un appel a l'API.
const REPONSE_BAN = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [3.063089, 50.625081] },
      properties: {
        label: '12 Rue de Lens 59000 Lille',
        score: 0.674,
        housenumber: '12',
        id: '59350_5499_00012',
        postcode: '59000',
        citycode: '59350',
        city: 'Lille',
        context: '59, Nord, Hauts-de-France',
        type: 'housenumber',
        street: 'Rue de Lens',
      },
    },
  ],
};

function repondre(corps: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(corps),
  } as Response);
}

describe('rechercherAdresse', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => repondre(REPONSE_BAN)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('convertit la réponse BAN, coordonnées dans le bon sens', async () => {
    const [a] = await rechercherAdresse('12 rue de lens');

    expect(a.label).toBe('12 Rue de Lens 59000 Lille');
    expect(a.numero).toBe('12');
    expect(a.rue).toBe('Rue de Lens');
    expect(a.code_postal).toBe('59000');
    expect(a.citycode).toBe('59350');
    // La BAN renvoie [longitude, latitude] : l'inversion est le piege classique.
    expect(a.longitude).toBe(3.063089);
    expect(a.latitude).toBe(50.625081);
  });

  it("n'appelle pas l'API en dessous de trois caractères", async () => {
    expect(await rechercherAdresse('ru')).toEqual([]);
    expect(await rechercherAdresse('   ')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('transmet les filtres', async () => {
    await rechercherAdresse('lens', {
      type: 'municipality', codePostal: '59000', limite: 3,
      autour: { latitude: 50.6, longitude: 3.0 },
    });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('type=municipality');
    expect(url).toContain('postcode=59000');
    expect(url).toContain('limit=3');
    expect(url).toContain('lat=50.6');
    expect(url).toContain('lon=3');
  });

  it('nomme explicitement le dépassement de quota', async () => {
    vi.stubGlobal('fetch', vi.fn(() => repondre({}, 429)));
    await expect(rechercherAdresse('lille')).rejects.toThrow(/Trop de recherches/);
  });

  it('traite une annulation comme un non-événement', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.reject(new DOMException('aborted', 'AbortError')),
    ));
    // Une frappe suivante annule la precedente : lever ici ferait clignoter
    // une erreur a chaque caractere tape.
    await expect(rechercherAdresse('lille')).resolves.toEqual([]);
  });

  it('signale une panne réseau', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    await expect(rechercherAdresse('lille')).rejects.toThrow(/injoignable/);
  });

  it('ignore une entrée sans libellé plutôt que de la rendre vide', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      repondre({ features: [{ properties: { id: 'x' } }, REPONSE_BAN.features[0]] }),
    ));
    const res = await rechercherAdresse('lille');
    expect(res).toHaveLength(1);
  });
});

describe('normaliser', () => {
  const base: AdresseSuggestion = {
    id: '59350_5499_00012',
    label: '12 Rue de Lens 59000 Lille',
    numero: '12', rue: 'Rue de Lens', code_postal: '59000', ville: 'Lille',
    citycode: '59350', contexte: '59, Nord, Hauts-de-France',
    type: 'housenumber', latitude: 50.625081, longitude: 3.063089, score: 0.674,
  };

  it("ne garde que la voie dans l'adresse", () => {
    // Repeter ville et code postal donnerait « 12 Rue de Lens 59000 Lille,
    // 59000 Lille » sur un devis.
    expect(normaliser(base).address).toBe('12 Rue de Lens');
    expect(normaliser(base).city).toBe('Lille');
    expect(normaliser(base).postal_code).toBe('59000');
  });

  it('gère une voie sans numéro', () => {
    expect(normaliser({ ...base, numero: null }).address).toBe('Rue de Lens');
  });

  it('renvoie null plutôt qu’une chaîne vide pour une commune seule', () => {
    expect(normaliser({ ...base, numero: null, rue: null }).address).toBeNull();
  });

  it('reporte la précision, qui décide si un itinéraire est proposé', () => {
    expect(normaliser(base).geo_precision).toBe('exact');
    expect(normaliser({ ...base, type: 'municipality' }).geo_precision).toBe('approximatif');
  });
});

describe('precisionDe', () => {
  const base: AdresseSuggestion = {
    id: 'x', label: 'Lille', numero: null, rue: null, code_postal: '59000',
    ville: 'Lille', citycode: '59350', contexte: null,
    type: 'municipality', latitude: 50.63, longitude: 3.06, score: 0.9,
  };

  it('ne tient une adresse pour exacte qu’au numéro ou à la voie', () => {
    expect(precisionDe({ ...base, type: 'housenumber' })).toBe('exact');
    expect(precisionDe({ ...base, type: 'street' })).toBe('exact');
    // Un centre de commune mènerait le technicien devant la mairie.
    expect(precisionDe({ ...base, type: 'municipality' })).toBe('approximatif');
    expect(precisionDe({ ...base, type: 'locality' })).toBe('approximatif');
  });

  it('renvoie null sans coordonnées', () => {
    expect(precisionDe({ ...base, latitude: null })).toBeNull();
  });
});

describe('lienItineraire', () => {
  it('privilégie les coordonnées quand elles existent', () => {
    const lien = lienItineraire({
      address: '12 Rue de Lens', city: 'Lille', latitude: 50.62, longitude: 3.06,
    });
    expect(lien).toContain('destination=50.62,3.06');
  });

  it('retombe sur l’adresse écrite, encodée', () => {
    const lien = lienItineraire({ address: '12 Rue de Lens', postal_code: '59000', city: 'Lille' });
    expect(lien).toContain('12%20Rue%20de%20Lens%2059000%20Lille');
  });

  it('ne fabrique pas de lien sans adresse', () => {
    expect(lienItineraire({})).toBeNull();
  });
});
