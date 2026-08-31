import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { navItems } from '@/config/navigation';

const BASE = 'Relais Pare-Brise';

/**
 * Titre de l'onglet suivant l'ecran affiche.
 *
 * Un titre fige empeche de retrouver le bon onglet quand plusieurs sont
 * ouverts, et prive les lecteurs d'ecran de l'annonce du changement de page.
 */
export function useTitrePage() {
  const { pathname } = useLocation();

  useEffect(() => {
    const entree = navItems
      .filter((i) => pathname === i.path || pathname.startsWith(i.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0];

    const specifiques: Record<string, string> = {
      '/interventions': 'Intervention',
      '/clients': 'Client',
    };
    const prefixe = Object.keys(specifiques).find((p) => pathname.startsWith(p));

    const titre = prefixe ? specifiques[prefixe] : entree?.label;
    document.title = titre ? `${titre} — ${BASE}` : BASE;
  }, [pathname]);
}
