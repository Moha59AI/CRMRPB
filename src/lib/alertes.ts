/**
 * Alertes système.
 *
 * Le CRM affiche une pastille dans la cloche, mais un conseiller qui a
 * l'onglet en arrière-plan ne la verra jamais. L'alerte du système
 * d'exploitation est la seule qui traverse.
 *
 * Deux chemins d'affichage, et le premier compte : passer par le service
 * worker plutôt que par `new Notification()`. Chrome sur Android refuse le
 * constructeur direct, et c'est aussi le seul chemin qui fonctionnera le jour
 * où les notifications arriveront par push, application fermée.
 */

export type EtatAlertes = 'indisponible' | 'a_autoriser' | 'autorisee' | 'refusee';

export function etatAlertes(): EtatAlertes {
  if (typeof Notification === 'undefined') return 'indisponible';
  if (Notification.permission === 'granted') return 'autorisee';
  if (Notification.permission === 'denied') return 'refusee';
  return 'a_autoriser';
}

/**
 * Demande la permission.
 *
 * À n'appeler que depuis un geste de l'utilisateur : réclamée au chargement,
 * la permission se refuse par réflexe — et un refus est définitif, le
 * navigateur ne redemandera plus.
 */
export async function demanderAlertes(): Promise<EtatAlertes> {
  if (typeof Notification === 'undefined') return 'indisponible';
  if (Notification.permission !== 'default') return etatAlertes();

  try {
    await Notification.requestPermission();
  } catch {
    // Navigateur sans support : la pastille reste.
  }
  return etatAlertes();
}

interface Alerte {
  titre: string;
  corps?: string | null;
  /** Où mène le clic sur l'alerte. */
  lien?: string | null;
  /** Deux alertes de même étiquette se remplacent au lieu de s'empiler. */
  etiquette?: string;
}

export async function afficherAlerte(a: Alerte): Promise<boolean> {
  if (etatAlertes() !== 'autorisee') return false;

  const options: NotificationOptions = {
    body: a.corps ?? undefined,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: a.etiquette,
    data: { lien: a.lien ?? '/today' },
  };

  // Le service worker d'abord : Chrome sur Android refuse le constructeur
  // direct, et c'est le chemin qui gerera le push plus tard.
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(a.titre, options);
      return true;
    }
  } catch {
    // On tente le chemin direct ci-dessous.
  }

  try {
    new Notification(a.titre, options);
    return true;
  } catch {
    return false;
  }
}
