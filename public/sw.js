/*
 * Service worker minimal.
 *
 * Son role est d'abord de rendre l'application installable : sans worker
 * declarant un gestionnaire `fetch`, le navigateur ne propose pas l'ajout a
 * l'ecran d'accueil.
 *
 * Ce qu'il ne fait volontairement pas : mettre en cache les donnees du CRM.
 * Un conseiller qui verrait une fiche perimee sans le savoir rappellerait un
 * client sur des informations fausses -- pire qu'une erreur reseau visible.
 * Les appels a Supabase passent donc toujours par le reseau.
 *
 * Ce qu'il fait : garder la coquille de l'application (le HTML, le JS et le
 * CSS compiles) pour un demarrage immediat, et un repli lisible quand le
 * reseau manque au chargement.
 */

const VERSION = 'v3';
const COQUILLE = `coquille-${VERSION}`;

/*
 * Le worker prend la main tout de suite.
 *
 * Sans `skipWaiting`, une version corrigee attendrait la fermeture de tous
 * les onglets pour s'activer -- sur un outil qu'on garde ouvert la journee,
 * ce serait des jours.
 */
self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Les coquilles des versions precedentes n'ont plus d'usage et
    // occuperaient le quota du navigateur.
    const noms = await caches.keys();
    await Promise.all(
      noms.filter((n) => n !== COQUILLE).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

/** Ce qui ne doit jamais sortir d'un cache. */
function donneesVivantes(url) {
  return (
    url.pathname.startsWith('/rest/')      // PostgREST
    || url.pathname.startsWith('/auth/')   // sessions
    || url.pathname.startsWith('/functions/')
    || url.hostname.endsWith('.supabase.co')
    || url.hostname.endsWith('.supabase.in')
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // On ne touche ni aux ecritures ni aux requetes d'une autre origine que la
  // notre : mettre en cache une reponse d'API serait le defaut a eviter.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || donneesVivantes(url)) return;

  // Navigation : le reseau d'abord, pour ne jamais servir une version
  // perimee de l'application. Le cache ne sert qu'en repli.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const reponse = await fetch(req);
        const cache = await caches.open(COQUILLE);
        cache.put('/index.html', reponse.clone());
        return reponse;
      } catch {
        const cache = await caches.open(COQUILLE);
        const repli = await cache.match('/index.html');
        if (repli) return repli;
        return new Response(
          '<!doctype html><meta charset="utf-8">'
          + '<p style="font:16px system-ui;padding:2rem">'
          + 'Hors connexion. Le CRM a besoin du réseau pour afficher vos données.'
          + '</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  // La coquille ne se lit jamais depuis le cache en dehors d'une navigation :
  // c'est elle que l'application interroge pour savoir si une version plus
  // recente est en ligne. Servie depuis le cache, la reponse annoncerait
  // toujours la version deja ouverte, et la mise a jour passerait inapercue.
  if (url.pathname === '/' || url.pathname === '/index.html') return;

  // Les fichiers compiles portent un empreinte dans leur nom : leur contenu
  // ne change jamais, le cache peut repondre sans demander.
  e.respondWith((async () => {
    const cache = await caches.open(COQUILLE);
    const enCache = await cache.match(req);
    if (enCache) return enCache;

    const reponse = await fetch(req);
    if (reponse.ok && reponse.type === 'basic') cache.put(req, reponse.clone());
    return reponse;
  })());
});

/*
 * Push serveur : ce chemin reste actif quand tous les onglets sont fermes.
 * Le serveur envoie volontairement un texte generique : une notification peut
 * apparaitre sur un ecran verrouille et ne doit jamais reveler un nom ou un
 * numero de client.
 */
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let payload = {};
    try {
      payload = e.data ? e.data.json() : {};
    } catch {
      payload = {};
    }

    const fenetres = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // Au premier plan, la cloche temps reel suffit. Le test force l'affichage
    // afin que l'utilisateur sache immediatement que son appareil fonctionne.
    const crmVisible = fenetres.some((client) => client.visibilityState === 'visible');
    if (crmVisible && !payload.force) return;

    await self.registration.showNotification(
      payload.title || 'Nouvelle notification CRM',
      {
        body: payload.body || 'Ouvrez le CRM pour consulter la nouvelle information.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: payload.tag || 'crm-notification',
        data: { lien: payload.link || '/today' },
      },
    );
  })());
});


/*
 * Clic sur une alerte systeme.
 *
 * Sans ce gestionnaire, cliquer une notification ne fait rien : elle se
 * ferme et l'utilisateur doit retrouver l'onglet lui-meme, ce qui annule
 * l'interet de l'alerte.
 *
 * On reutilise un onglet deja ouvert plutot que d'en empiler un nouveau a
 * chaque lead -- sinon une matinee chargee laisse quinze onglets du CRM.
 */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = e.notification.data && e.notification.data.lien;

  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const f of fenetres) {
      if (new URL(f.url).origin === self.location.origin) {
        await f.focus();
        // Le routeur de l'application gere la navigation : recharger ferait
        // perdre l'etat de l'ecran en cours.
        if (cible) f.postMessage({ type: 'naviguer', lien: cible });
        return;
      }
    }

    await self.clients.openWindow(cible || '/today');
  })());
});
