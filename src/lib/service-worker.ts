/**
 * Enregistrement du service worker.
 *
 * Uniquement en production : en développement, un worker qui garde la
 * coquille en cache se bat avec le rechargement à chaud de Vite et fait
 * croire à des modifications qui ne s'appliquent pas.
 *
 * L'échec est silencieux et sans conséquence : le CRM fonctionne
 * exactement pareil sans worker, il n'est simplement plus installable.
 */
export function enregistrerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  // Après le chargement : l'enregistrement consomme de la bande passante, et
  // l'affichage de la première page compte plus.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Rien à signaler à l'utilisateur : il ne perd aucune fonctionnalité.
    });
  });
}
