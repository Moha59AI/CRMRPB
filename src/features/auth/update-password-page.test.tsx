import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UpdatePasswordPage } from './update-password-page';

const desabonner = vi.fn();
const auth = {
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: desabonner } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  updateUser: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
};

vi.mock('@/lib/supabase', () => ({
  supabase: { get auth() { return auth; } },
  supabaseUrl: 'https://test.supabase.co',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function afficher() {
  return render(<MemoryRouter><UpdatePasswordPage /></MemoryRouter>);
}

beforeEach(() => {
  window.location.hash = '';
  auth.getSession.mockResolvedValue({ data: { session: null } });
});

describe('changement de mot de passe', () => {
  it('refuse clairement un lien sans session de recuperation', async () => {
    afficher();
    expect(await screen.findByText(/lien invalide ou expiré/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /demander un nouveau lien/i })).toBeInTheDocument();
  });

  it('detecte l erreur portee par le fragment du lien', async () => {
    // Un lien expire ou deja utilise revient avec ?error dans le fragment :
    // afficher le formulaire serait trompeur.
    window.location.hash = '#error=access_denied&error_description=expired';
    afficher();
    expect(await screen.findByText(/lien invalide ou expiré/i)).toBeInTheDocument();
  });

  it('affiche le formulaire quand la session de recuperation existe', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    } as never);
    afficher();
    expect(await screen.findByLabelText(/nouveau mot de passe/i)).toBeInTheDocument();
  });

  it('exige huit caracteres', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never);
    afficher();

    await userEvent.type(await screen.findByLabelText(/nouveau mot de passe/i), 'court');
    await userEvent.type(screen.getByLabelText(/confirmer/i), 'court');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText(/au moins 8 caractères/i)).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('refuse deux saisies differentes', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never);
    afficher();

    await userEvent.type(await screen.findByLabelText(/nouveau mot de passe/i), 'motdepasse1');
    await userEvent.type(screen.getByLabelText(/confirmer/i), 'motdepasse2');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText(/ne correspondent pas/i)).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('ferme la session de recuperation apres le changement', async () => {
    // Cette session ne sert qu'au changement : la laisser ouverte reviendrait
    // a connecter quiconque possede le lien.
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never);
    afficher();

    await userEvent.type(await screen.findByLabelText(/nouveau mot de passe/i), 'motdepasse1');
    await userEvent.type(screen.getByLabelText(/confirmer/i), 'motdepasse1');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText(/mot de passe modifié/i)).toBeInTheDocument();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'motdepasse1' });
    expect(auth.signOut).toHaveBeenCalled();
  });
});
