import { supabase } from '@/lib/supabase';

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

export type EtatAlertes =
  | 'indisponible'
  | 'installation_requise'
  | 'a_autoriser'
  | 'activation'
  | 'autorisee'
  | 'refusee'
  | 'erreur';

function estIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function estInstallee(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function supportePush(): boolean {
  return typeof Notification !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export function etatAlertes(): EtatAlertes {
  if (typeof window === 'undefined') return 'indisponible';
  if (estIOS() && !estInstallee()) return 'installation_requise';
  if (!supportePush()) return 'indisponible';
  if (Notification.permission === 'granted') return 'activation';
  if (Notification.permission === 'denied') return 'refusee';
  return 'a_autoriser';
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function deviceLabel(): string {
  if (estIOS()) return 'iPhone / iPad';
  if (/Android/i.test(navigator.userAgent)) return 'Téléphone Android';
  return 'Ordinateur';
}

async function invokePush(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('web-push', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as Record<string, unknown>;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  let worker = await navigator.serviceWorker.getRegistration('/');
  if (!worker) worker = await navigator.serviceWorker.register('/sw.js');
  if (!worker.active) return navigator.serviceWorker.ready;
  return worker;
}

async function registerOnServer(subscription: PushSubscription): Promise<void> {
  await invokePush({
    action: 'register',
    subscription: subscription.toJSON(),
    device_label: deviceLabel(),
  });
}

async function subscribe(): Promise<PushSubscription> {
  const worker = await registration();
  const config = await invokePush({ action: 'config' });
  const publicKey = typeof config.public_key === 'string' ? config.public_key : '';
  if (!publicKey) throw new Error('Clé publique push absente');
  const applicationServerKey = base64UrlToUint8Array(publicKey);

  const existing = await worker.pushManager.getSubscription();
  if (existing) {
    const currentKey = existing.options.applicationServerKey
      ? new Uint8Array(existing.options.applicationServerKey)
      : null;
    const sameKey = currentKey?.length === applicationServerKey.length
      && currentKey.every((value, index) => value === applicationServerKey[index]);
    if (sameKey) {
      await registerOnServer(existing);
      return existing;
    }
    await existing.unsubscribe();
  }

  const created = await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  });
  await registerOnServer(created);
  return created;
}

/** Repare silencieusement une inscription existante a chaque ouverture. */
export async function verifierAlertes(): Promise<EtatAlertes> {
  const current = etatAlertes();
  if (current !== 'activation') return current;
  try {
    await subscribe();
    return 'autorisee';
  } catch {
    return 'erreur';
  }
}

/**
 * Demande la permission.
 *
 * À n'appeler que depuis un geste de l'utilisateur : réclamée au chargement,
 * la permission se refuse par réflexe — et un refus est définitif, le
 * navigateur ne redemandera plus.
 */
export async function demanderAlertes(): Promise<EtatAlertes> {
  const current = etatAlertes();
  if (current === 'indisponible' || current === 'installation_requise' || current === 'refusee') {
    return current;
  }

  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return etatAlertes();
    await subscribe();
  } catch {
    return 'erreur';
  }
  return 'autorisee';
}

export async function testerAlertes(): Promise<boolean> {
  try {
    const worker = await registration();
    const subscription = await worker.pushManager.getSubscription();
    if (!subscription) return false;
    await invokePush({ action: 'test', endpoint: subscription.endpoint });
    return true;
  } catch {
    return false;
  }
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
  if (Notification.permission !== 'granted') return false;

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
    const reg = await registration();
    await reg.showNotification(a.titre, options);
    return true;
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
