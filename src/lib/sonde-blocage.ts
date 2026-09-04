// Sonde de diagnostic — pourquoi l'interface cesse de repondre au clic
//
// TEMPORAIRE. A retirer une fois la cause identifiee.
//
// Le symptome (page normale, plus aucun clic) a trois causes possibles et
// elles se corrigent differemment. Aucune ne se distingue a l'oeil, d'ou
// cette sonde : elle affiche en continu de quoi trancher, sans avoir a
// ouvrir la console.
//
//   coeur   compteur incremente toutes les 500 ms.
//           S'il se fige, le fil principal est bloque (boucle infinie) et
//           tout le reste de la sonde est de toute facon suspendu.
//
//   clics   nombre de clics recus par `document` en phase de capture.
//           S'il n'augmente plus alors que le coeur bat, les evenements
//           n'arrivent plus jusqu'au document : verrou `pointer-events`,
//           ou couche transparente qui les intercepte.
//
//   verrou  valeur de `body.style.pointerEvents`.
//
//   couches nombre de couches modales reellement affichees.
//
//   cible   ce qui se trouve sous le pointeur au dernier mouvement. Si les
//           clics n'arrivent plus mais que la cible change, un element
//           precis les avale -- son nom est affiche.

const CLE_STYLE = 'sonde-blocage-style';

export function installerSondeBlocage(): () => void {
  if (typeof document === 'undefined') return () => {};

  let coeur = 0;
  let clics = 0;
  let derniereCible = '—';

  const boite = document.createElement('div');
  boite.id = 'sonde-blocage';
  boite.setAttribute('data-sonde', 'true');

  const style = document.createElement('style');
  style.id = CLE_STYLE;
  style.textContent = `
    #sonde-blocage {
      position: fixed; right: 8px; bottom: 8px; z-index: 2147483647;
      background: rgba(17,17,17,.92); color: #eee; font: 11px/1.45 ui-monospace, monospace;
      padding: 8px 10px; border-radius: 8px; white-space: pre; pointer-events: none;
      max-width: 46ch; overflow: hidden;
    }
    #sonde-blocage b { color: #4ade80; }
    #sonde-blocage .alerte { color: #f87171; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(boite);

  const surClic = () => { clics += 1; };
  // Capture : on compte le clic meme si un composant l'arrete ensuite.
  document.addEventListener('click', surClic, true);
  document.addEventListener('pointerdown', surClic, true);

  const surMouvement = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    derniereCible = el
      ? el.tagName.toLowerCase() +
        (el.id ? '#' + el.id : '') +
        '.' + String((el as HTMLElement).className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      : 'AUCUN';
  };
  document.addEventListener('mousemove', surMouvement, true);

  function couchesAffichees(): number {
    let n = 0;
    const sel = '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]';
    for (const noeud of document.querySelectorAll(sel)) {
      const el = noeud as HTMLElement;
      if (el.getClientRects().length === 0) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      n += 1;
    }
    return n;
  }

  const battre = () => {
    coeur += 1;
    const verrou = document.body.style.pointerEvents || 'auto';
    const couches = couchesAffichees();
    const suspect = verrou === 'none' && couches === 0;

    boite.innerHTML =
      `<b>sonde</b>  coeur ${coeur}   clics ${clics}\n` +
      `verrou  ${suspect ? '<span class="alerte">' + verrou + ' (orphelin)</span>' : verrou}\n` +
      `couches ${couches}\n` +
      `cible   ${derniereCible.slice(0, 40)}`;
  };

  battre();
  const minuteur = setInterval(battre, 500);

  return () => {
    clearInterval(minuteur);
    document.removeEventListener('click', surClic, true);
    document.removeEventListener('pointerdown', surClic, true);
    document.removeEventListener('mousemove', surMouvement, true);
    boite.remove();
    document.getElementById(CLE_STYLE)?.remove();
  };
}
