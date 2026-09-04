// Filet de securite contre un verrou de clic reste bloque
//
// Radix desactive les clics sur le reste de la page quand une couche modale
// s'ouvre : `document.body.style.pointerEvents = 'none'`. La valeur d'origine
// est memorisee dans une variable **partagee par tout le module**
// (`originalBodyPointerEvents`, @radix-ui/react-dismissable-layer).
//
// Quand une couche se monte pendant qu'une autre se demonte -- exactement ce
// qui arrive lorsqu'un dialogue de confirmation se ferme et que la navigation
// demonte la fiche dans le meme rendu -- la nouvelle couche memorise `'none'`
// comme etant l'etat d'origine, puis le restaure en partant. Le verrou ne se
// leve alors jamais.
//
// Symptome : la page s'affiche normalement, le clavier repond, mais plus
// aucun clic ne passe. Il faut recharger.
//
// Ce module observe l'attribut `style` de `body` et leve le verrou quand plus
// aucune couche modale n'est ouverte. Il ne remplace pas Radix : il rattrape
// le cas ou Radix a perdu la trace de l'etat initial.

/** Couches Radix qui justifient legitimement un verrou de clic. */
const COUCHES_OUVERTES = [
  '[data-state="open"][role="dialog"]',
  '[data-state="open"][role="alertdialog"]',
  '[data-state="open"][role="menu"]',
  '[data-state="open"][role="listbox"]',
  '[data-radix-popper-content-wrapper]',
].join(', ');

/**
 * Une couche ne justifie le verrou que si elle est **reellement affichee**.
 *
 * Se fier au seul `data-state="open"` ne suffit pas : quand la fiche est
 * demontee pendant que son dialogue se ferme, Radix n'acheve pas son menage
 * et laisse dans le DOM un noeud qui porte encore cet attribut alors qu'il
 * n'est plus rendu. Le verrou paraissait alors legitime et n'etait jamais
 * leve -- la page restait morte au clic jusqu'au rechargement.
 */
function verrouLegitime(): boolean {
  for (const noeud of document.querySelectorAll(COUCHES_OUVERTES)) {
    const element = noeud as HTMLElement;

    // Ni surface, ni position : le noeud n'est plus dans le rendu.
    if (element.getClientRects().length === 0) continue;

    const style = getComputedStyle(element);
    if (style.display === 'none') continue;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') continue;
    if (Number(style.opacity) === 0) continue;

    return true;
  }
  return false;
}

/**
 * @returns vrai si le verrou est toujours en place et juge legitime, donc
 *          s'il faut continuer a le surveiller.
 */
function verifier(): boolean {
  if (document.body.style.pointerEvents !== 'none') return false;

  if (verrouLegitime()) {
    // Une couche est bien affichee : on laisse, mais on garde un oeil. Sa
    // disparition peut n'entrainer aucune mutation sur `body` -- il suffit
    // qu'elle passe en `display:none` sur elle-meme -- et personne ne nous
    // reveillerait.
    return true;
  }

  // Plus aucune couche affichee : le verrou est orphelin.
  document.body.style.removeProperty('pointer-events');
  return false;
}

/**
 * Installe la surveillance. A appeler une fois au demarrage.
 *
 * @returns de quoi arreter la surveillance.
 */
export function surveillerVerrouPointeur(): () => void {
  if (typeof document === 'undefined') return () => {};

  // Marqueur de diagnostic : permet de verifier depuis la console que la
  // surveillance tourne bien, plutot que de le supposer.
  if (import.meta.env.DEV) {
    (window as unknown as { __verrouPointeur?: unknown }).__verrouPointeur = {
      actif: true,
      verifier,
      etat: () => ({
        verrou: document.body.style.pointerEvents || '(aucun)',
        coucheLegitime: verrouLegitime(),
      }),
    };
  }

  let minuteur: ReturnType<typeof setTimeout> | null = null;

  // L'observateur se declenche pendant que Radix manipule le style. On laisse
  // le rendu se terminer avant de juger : sinon on leverait un verrou que la
  // couche suivante est en train de poser legitimement.
  //
  // setTimeout plutot que requestAnimationFrame : rAF est suspendu quand
  // l'onglet passe en arriere-plan. Un verrou pose juste avant un changement
  // d'onglet resterait alors en place, et l'utilisateur retrouverait au retour
  // une page qui ne repond plus au clic -- precisement ce qu'on veut eviter.
  const planifierVerification = (delai = 60) => {
    if (minuteur !== null) return;
    minuteur = setTimeout(() => {
      minuteur = null;
      // Tant qu'un verrou juge legitime tient, on repasse regulierement :
      // c'est le seul moyen de voir disparaitre une couche sans que `body`
      // ne bouge. La surveillance s'arrete d'elle-meme des que le verrou
      // est leve, elle ne tourne donc jamais en continu.
      if (verifier()) planifierVerification(500);
    }, delai);
  };

  // Deux signaux, et le second est indispensable :
  //
  // - `attributes` capte la pose du verrou.
  // - `childList` capte le retrait d'une couche. C'est ce qui compte : dans la
  //   fuite, Radix ne retouche jamais le style de `body` en partant. En
  //   n'observant que le style, on ne serait prevenu de rien au moment precis
  //   ou le verrou devient orphelin. Les couches Radix sont montees en portail
  //   directement dans `body`, leur disparition s'y voit donc.
  // Enveloppe : MutationObserver passe la liste des mutations en argument,
  // qui serait prise pour un delai.
  const observateur = new MutationObserver(() => planifierVerification());
  observateur.observe(document.body, {
    attributes: true,
    attributeFilter: ['style'],
    childList: true,
  });

  // Le verrou a pu rester d'une session precedente de l'onglet (rechargement
  // a chaud en developpement, retour arriere du navigateur).
  planifierVerification();

  return () => {
    observateur.disconnect();
    if (minuteur !== null) clearTimeout(minuteur);
  };
}
