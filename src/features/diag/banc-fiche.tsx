// Banc d'essai — reproduction du blocage a la fermeture par la croix
//
// TEMPORAIRE, developpement uniquement. A retirer avec la sonde.
//
// Reproduit le montage exact du CRM sans authentification : une liste, une
// fiche superposee ouverte par `navigate` avec `background`, et la meme coque
// FicheOverlay. Permet d'enchainer les cycles ouverture / fermeture par la
// croix et de voir a partir de quand l'interface cesse de repondre.

import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { FicheOverlay } from '@/features/fiche/fiche-overlay';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { Button } from '@/components/ui/button';

const ELEMENTS = ['1111', '2222', '3333', '4444', '5555'];

export function BancListe() {
  const navigate = useNavigate();
  const location = useLocation();
  const [compteur, setCompteur] = useState(0);

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold">Banc d&apos;essai — fermeture par la croix</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ouvrez puis fermez par la croix, plusieurs fois de suite. Le compteur
        ci-dessous prouve que la page repond encore : cliquez-le entre chaque
        cycle.
      </p>

      <Button
        type="button"
        className="mt-4 rounded-full"
        onClick={() => setCompteur((c) => c + 1)}
      >
        Test de reactivite : {compteur}
      </Button>

      <ul className="mt-6 space-y-2">
        {ELEMENTS.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted"
              onClick={() =>
                navigate(`/diag-fiche/${id}`, {
                  state: { background: fondDepuis(location), liste: ELEMENTS },
                })
              }
            >
              Ouvrir la fiche {id}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BancFiche({ pleinePage }: { pleinePage?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [onglet, setOnglet] = useState<'a' | 'b'>('a');

  const etat = (location.state ?? {}) as { background?: unknown };

  const fermer = () => {
    if (pleinePage || !etat.background) navigate('/diag-fiche');
    else navigate(-1);
  };

  return (
    <FicheOverlay
      entete={<div className="text-base font-semibold">Fiche {id}</div>}
      onglets={[
        { cle: 'a', label: 'Onglet A' },
        { cle: 'b', label: 'Onglet B' },
      ]}
      ongletActif={onglet}
      onChangerOnglet={setOnglet}
      onFermer={fermer}
      pleinePage={pleinePage}
    >
      <p className="text-sm text-muted-foreground">
        Contenu de la fiche {id}. Fermez avec la croix en haut a droite.
      </p>
    </FicheOverlay>
  );
}
