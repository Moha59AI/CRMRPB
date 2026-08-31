import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RelanceRow } from './relance-row';
import type { Relance } from '@/services/relances-service';

function relance(surcharge: Partial<Relance> = {}): Relance {
  return {
    id: 'lead:1', kind: 'rappel', urgency: 'urgent',
    dueAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    daysLate: 4, waitingMinutes: null, score: 65, priority: 'haute',
    titre: 'Pascal Guilluy', motif: 'N’a pas répondu',
    phone: '0659130462', city: 'Lille', insurance: 'AXA',
    vehicule: 'Clio IV', immatriculation: 'AB-123-CD',
    assignedUserId: null, leadId: 'l1', taskId: null, appointmentId: null,
    caseId: null, invoiceId: null, savId: null,
    attemptCount: 2, lastActionAt: null, lastActionType: null,
    ...surcharge,
  };
}

const handlers = {
  onSelection: vi.fn(), onAppeler: vi.fn(), onSms: vi.fn(),
  onDemanderDocuments: vi.fn(), onReporter: vi.fn(),
  onTraiter: vi.fn(), onOuvrir: vi.fn(),
};

describe('ligne de relance', () => {
  it('exprime le retard en jours', () => {
    render(<RelanceRow relance={relance()} selectionnee={false} enCours={false} {...handlers} />);
    expect(screen.getByText('4 j de retard')).toBeInTheDocument();
  });

  it('compte en minutes un lead jamais appele', () => {
    // Sur un lead publicitaire tout se joue dans le premier quart d'heure :
    // la journee est une unite trop grossiere.
    render(
      <RelanceRow
        relance={relance({ kind: 'nouveau', waitingMinutes: 12, urgency: 'due', daysLate: 0 })}
        selectionnee={false} enCours={false} {...handlers}
      />
    );
    expect(screen.getByText('il y a 12 min')).toBeInTheDocument();
  });

  it('propose des actions differentes selon l etape', () => {
    const { rerender } = render(
      <RelanceRow relance={relance()} selectionnee={false} enCours={false} {...handlers} />
    );
    expect(screen.queryByRole('button', { name: /demander les documents/i })).toBeNull();

    rerender(
      <RelanceRow relance={relance({ kind: 'documents' })} selectionnee={false} enCours={false} {...handlers} />
    );
    expect(screen.getByRole('button', { name: /demander les documents/i })).toBeInTheDocument();
  });

  it('n offre ni appel ni SMS sans numero', () => {
    render(
      <RelanceRow relance={relance({ phone: null })} selectionnee={false} enCours={false} {...handlers} />
    );
    expect(screen.queryByRole('button', { name: /^appeler/i })).toBeNull();
  });

  it('ouvre la fiche au clic sur le nom', async () => {
    const onOuvrir = vi.fn();
    const r = relance();
    render(<RelanceRow relance={r} selectionnee={false} enCours={false} {...handlers} onOuvrir={onOuvrir} />);
    await userEvent.click(screen.getByText('Pascal Guilluy'));
    expect(onOuvrir).toHaveBeenCalledWith(r);
  });

  it('affiche la derniere action datee', () => {
    render(
      <RelanceRow
        relance={relance({
          lastActionType: 'sms_outbound',
          lastActionAt: new Date(Date.now() - 86400000).toISOString(),
        })}
        selectionnee={false} enCours={false} {...handlers}
      />
    );
    expect(screen.getByText(/SMS envoyé hier/)).toBeInTheDocument();
  });

  it('expose le score derriere le badge de priorite', () => {
    render(<RelanceRow relance={relance()} selectionnee={false} enCours={false} {...handlers} />);
    expect(screen.getByTitle('Score de priorité : 65')).toBeInTheDocument();
  });
});
