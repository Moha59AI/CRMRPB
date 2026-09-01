import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChampAdresse } from './ChampAdresse';
import type { AdresseNormalisee } from '@/services/adresse-service';

const REPONSE = {
  features: [
    {
      geometry: { coordinates: [3.063089, 50.625081] },
      properties: {
        label: '12 Rue de Lens 59000 Lille', id: 'a1', housenumber: '12',
        street: 'Rue de Lens', postcode: '59000', city: 'Lille',
        citycode: '59350', context: '59, Nord, Hauts-de-France',
        type: 'housenumber', score: 0.67,
      },
    },
    {
      geometry: { coordinates: [2.83, 50.43] },
      properties: {
        label: '12 Rue de Lens 62300 Lens', id: 'a2', housenumber: '12',
        street: 'Rue de Lens', postcode: '62300', city: 'Lens',
        citycode: '62498', context: '62, Pas-de-Calais, Hauts-de-France',
        type: 'housenumber', score: 0.61,
      },
    },
  ],
};

/** Le composant est controle : ce hote porte l'etat, comme les vrais appelants. */
function Hote({ onChoisir }: { onChoisir: (a: AdresseNormalisee) => void }) {
  const [valeur, setValeur] = useState('');
  return (
    <ChampAdresse
      label="Adresse"
      valeur={valeur}
      onValeurChange={setValeur}
      onChoisir={onChoisir}
    />
  );
}

describe('ChampAdresse', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(REPONSE) } as Response),
    ));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('propose des suggestions après la saisie', async () => {
    render(<Hote onChoisir={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Adresse'), '12 rue de lens');

    expect(await screen.findByText('12 Rue de Lens 59000 Lille')).toBeInTheDocument();
    expect(screen.getByText('12 Rue de Lens 62300 Lens')).toBeInTheDocument();
  });

  it('remonte l’adresse normalisée au choix', async () => {
    const onChoisir = vi.fn();
    render(<Hote onChoisir={onChoisir} />);
    await userEvent.type(screen.getByLabelText('Adresse'), '12 rue de lens');

    await userEvent.click(await screen.findByText('12 Rue de Lens 59000 Lille'));

    expect(onChoisir).toHaveBeenCalledWith({
      address: '12 Rue de Lens',
      postal_code: '59000',
      city: 'Lille',
      citycode: '59350',
      latitude: 50.625081,
      longitude: 3.063089,
    });
  });

  it('n’interroge pas l’API sous trois caractères', async () => {
    render(<Hote onChoisir={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Adresse'), 'ru');

    await new Promise((r) => setTimeout(r, 400));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('regroupe les frappes en un seul appel', async () => {
    render(<Hote onChoisir={vi.fn()} />);
    // Sans anti-rebond, quatorze caracteres feraient quatorze appels contre
    // une limite de debit partagee par IP.
    await userEvent.type(screen.getByLabelText('Adresse'), '12 rue de lens');

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(3);
  });

  it('se navigue au clavier', async () => {
    const onChoisir = vi.fn();
    render(<Hote onChoisir={onChoisir} />);
    const champ = screen.getByLabelText('Adresse');

    await userEvent.type(champ, '12 rue de lens');
    await screen.findByText('12 Rue de Lens 59000 Lille');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChoisir).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Lens', citycode: '62498' }),
    );
  });

  it('laisse saisir une adresse absente du référentiel', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ features: [] }) } as Response),
    ));

    render(<Hote onChoisir={vi.fn()} />);
    const champ = screen.getByLabelText('Adresse');
    await userEvent.type(champ, 'Lotissement des Tilleuls');

    // Aucune liste, mais le texte reste : refuser bloquerait un conseiller
    // au telephone.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(champ).toHaveValue('Lotissement des Tilleuls');
  });

  it('invite à la saisie manuelle quand le service est indisponible', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));

    render(<Hote onChoisir={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Adresse'), '12 rue de lens');

    expect(await screen.findByText(/saisir l'adresse à la main/)).toBeInTheDocument();
  });
});
