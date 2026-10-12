/**
 * Retablit automatiquement une feuille de style qu'un ancien service worker
 * aurait polluee avec la reponse HTML de secours.
 *
 * Le parametre unique force une nouvelle cle de cache. La nouvelle version du
 * worker supprimera ensuite definitivement l'ancien cache pendant son
 * activation. Aucun rechargement manuel de la page n'est necessaire.
 */
export function reparerFeuillesDeStyle(): void {
  if (import.meta.env.DEV) return;

  const feuilles = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"][href]',
  );

  feuilles.forEach((feuille) => {
    let reparationLancee = false;

    const reparer = () => {
      if (reparationLancee) return;
      reparationLancee = true;

      const url = new URL(feuille.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      url.searchParams.set('crm-style-reload', Date.now().toString());
      feuille.href = url.toString();
    };

    feuille.addEventListener('error', reparer, { once: true });

    // Une erreur de type MIME peut survenir avant l'execution du module
    // principal. Le controle apres `load` couvre aussi ce cas deja passe.
    window.addEventListener('load', () => {
      if (!feuille.sheet) reparer();
    }, { once: true });
  });
}
