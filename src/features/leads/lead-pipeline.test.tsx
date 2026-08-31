import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeadPipeline } from './lead-pipeline';

describe('pipeline du lead', () => {
  it('regroupe les statuts transitoires sous un meme jalon', () => {
    // calling et nrp sont deux etats d'une meme phase : les afficher comme
    // deux etapes distinctes donnerait un pipeline illisible.
    const { rerender } = render(
      <LeadPipeline statut="calling" onChangerStatut={vi.fn()} />
    );
    expect(screen.getByText('En contact')).toBeInTheDocument();

    rerender(<LeadPipeline statut="nrp" onChangerStatut={vi.fn()} />);
    expect(screen.getByText('En contact')).toBeInTheDocument();
  });

  it('traite « perdu » comme une sortie et non comme une etape', () => {
    render(<LeadPipeline statut="lost" onChangerStatut={vi.fn()} />);
    expect(screen.getByText('Lead perdu')).toBeInTheDocument();
    expect(screen.queryByText('Nouveau')).not.toBeInTheDocument();
  });

  it('permet de reactiver un lead perdu', async () => {
    const onChanger = vi.fn();
    render(<LeadPipeline statut="lost" onChangerStatut={onChanger} />);
    await userEvent.click(screen.getByRole('button', { name: /réactiver/i }));
    expect(onChanger).toHaveBeenCalledWith('to_call');
  });

  it('fait avancer le lead au clic sur une etape', async () => {
    const onChanger = vi.fn();
    render(<LeadPipeline statut="new" onChangerStatut={onChanger} />);
    await userEvent.click(screen.getByText('Documents'));
    expect(onChanger).toHaveBeenCalledWith('documents_requested');
  });

  it('n accepte aucun clic quand une ecriture est en cours', async () => {
    const onChanger = vi.fn();
    render(<LeadPipeline statut="new" onChangerStatut={onChanger} desactive />);
    await userEvent.click(screen.getByText('Documents'));
    expect(onChanger).not.toHaveBeenCalled();
  });
});
