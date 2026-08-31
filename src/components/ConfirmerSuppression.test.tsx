import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmerSuppression } from './ConfirmerSuppression';

describe('confirmation de suppression', () => {
  it('nomme l element vise', async () => {
    // « Supprimer ? » ne permet pas de verifier qu'on a clique sur la bonne
    // ligne, ce qui est precisement le moment ou l'on se trompe.
    render(
      <ConfirmerSuppression
        ouvert onOuvertChange={vi.fn()} nom="RDV Dupont — mardi 14h"
        onConfirmer={vi.fn()}
      />
    );
    expect(await screen.findByText(/RDV Dupont — mardi 14h/)).toBeInTheDocument();
  });

  it('ne supprime rien sans confirmation explicite', async () => {
    const onConfirmer = vi.fn();
    render(
      <ConfirmerSuppression
        ouvert onOuvertChange={vi.fn()} nom="Webhook site"
        onConfirmer={onConfirmer}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: /annuler/i }));
    expect(onConfirmer).not.toHaveBeenCalled();
  });

  it('declenche la suppression au bouton de confirmation', async () => {
    const onConfirmer = vi.fn();
    render(
      <ConfirmerSuppression
        ouvert onOuvertChange={vi.fn()} nom="Webhook site"
        onConfirmer={onConfirmer}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: /supprimer définitivement/i }));
    expect(onConfirmer).toHaveBeenCalledTimes(1);
  });

  it('propose l alternative quand elle existe', async () => {
    render(
      <ConfirmerSuppression
        ouvert onOuvertChange={vi.fn()} nom="Webhook site"
        onConfirmer={vi.fn()}
        alternative={<>Préférez désactiver l'endpoint</>}
      />
    );
    expect(await screen.findByText(/désactiver l'endpoint/)).toBeInTheDocument();
  });
});
