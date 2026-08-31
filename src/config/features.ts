/**
 * Drapeaux de fonctionnalites.
 *
 * `VITE_DEMO_TOOLS` doit etre pose explicitement, et le mode developpement est
 * exige en plus : un fichier .env copie par erreur en production ne suffit
 * donc pas a rouvrir les outils de demonstration.
 */
export const OUTILS_DEMO_ACTIFS =
  import.meta.env.DEV && import.meta.env.VITE_DEMO_TOOLS === 'true';
