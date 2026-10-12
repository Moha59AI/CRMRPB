/**
 * Detection d'une version plus recente du CRM.
 *
 * Le deploiement ajoute les nouveaux fichiers sans retirer les anciens. Un
 * onglet ouvert avant une mise en ligne continue donc de fonctionner sur
 * l'ancienne version : rien ne casse, rien ne manque a l'ecran, et la
 * navigation interne au CRM ne redemande jamais la page. L'utilisateur peut
 * passer la journee sur un CRM perime sans le savoir -- et chercher un bouton
 * qui existe deja chez tout le monde.
 *
 * On compare donc regulierement le script charge par la page a celui que le
 * serveur annonce. Son nom porte une empreinte du contenu : deux noms
 * differents, deux versions differentes.
 *
 * On previent, on ne recharge pas : un rechargement impose ferait perdre une
 * saisie en cours.
 */

const INTERVALLE_MS = 5 * 60_000;
const DELAI_MINIMUM_MS = 60_000;

function scriptPrincipal(racine: Document): string | null {
  const script = racine.querySelector('script[type="module"][src]');
  return script?.getAttribute('src') ?? null;
}

export function surveillerNouvelleVersion(auChangement: () => void): () => void {
  if (import.meta.env.DEV) return () => {};

  const version = scriptPrincipal(document);
  if (!version) return () => {};

  let arrete = false;
  let signale = false;
  let derniereVerification = 0;

  const verifier = async () => {
    if (arrete || signale) return;
    // Un onglet en arriere-plan ne sert a rien a personne : on interroge le
    // serveur quand quelqu'un regarde.
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - derniereVerification < DELAI_MINIMUM_MS) return;
    derniereVerification = Date.now();

    try {
      const reponse = await fetch('/index.html', { cache: 'no-store' });
      if (!reponse.ok) return;

      // `DOMParser` n'execute rien : il construit un arbre et s'arrete la.
      const distante = scriptPrincipal(
        new DOMParser().parseFromString(await reponse.text(), 'text/html'),
      );
      if (!distante || distante === version) return;

      signale = true;
      auChangement();
    } catch {
      // Reseau absent ou serveur indisponible : la prochaine verification
      // repassera. Ce n'est pas une information a remonter a l'utilisateur.
    }
  };

  const minuteur = window.setInterval(verifier, INTERVALLE_MS);
  document.addEventListener('visibilitychange', verifier);

  // Vérifier dès l'ouverture évite qu'une navigation interne affiche encore
  // pendant cinq minutes un ancien module lourd (atelier 3D, finance, mail).
  // La requête est sans cache et ne recharge jamais de force : si une saisie
  // est en cours, l'utilisateur garde la main et choisit le bon moment.
  void verifier();

  return () => {
    arrete = true;
    window.clearInterval(minuteur);
    document.removeEventListener('visibilitychange', verifier);
  };
}
