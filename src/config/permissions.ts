import type { UserRole } from '@/types';

/**
 * Application de MATRICE-ROLES.md cote interface.
 *
 * Ce fichier ne protege rien : il evite de proposer une action qui sera de
 * toute facon refusee en base. La securite reelle vit dans les politiques RLS
 * et dans les fonctions SQL, atteignables directement avec la cle anon.
 */

/** Roles autorises par chemin. Un chemin absent est ouvert a tous les roles. */
export const ROLES_PAR_CHEMIN: Record<string, UserRole[]> = {
  '/leads': ['admin', 'manager', 'advisor'],
  '/relances': ['admin', 'manager', 'advisor'],
  '/contacts': ['admin', 'manager', 'advisor', 'accountant'],
  '/interventions': ['admin', 'manager', 'advisor', 'technician'],
  '/atelier': ['admin', 'manager', 'advisor', 'technician'],
  '/clients': ['admin', 'manager', 'advisor', 'accountant'],
  '/cases': ['admin', 'manager', 'advisor', 'accountant', 'technician'],
  '/calendar': ['admin', 'manager', 'advisor', 'technician'],
  '/marketing': ['admin', 'manager', 'advisor'],
  '/campaigns': ['admin', 'manager', 'advisor'],
  '/communications': ['admin', 'manager', 'advisor'],
  '/emails': ['admin', 'manager', 'advisor'],
  '/workflows': ['admin', 'manager', 'advisor'],
  '/billing': ['admin', 'manager', 'accountant'],
  '/finance': ['admin', 'manager', 'accountant'],
  '/finance/fournisseurs': ['admin', 'manager', 'accountant'],
  '/finance/rapprochement': ['admin', 'manager', 'accountant'],
  '/settings': ['admin', 'manager'],
  '/settings/integrations': ['admin'],
  '/settings/integrations/meta': ['admin'],
  '/settings/integrations/google': ['admin'],
  '/settings/integrations/onify': ['admin'],
  '/settings/integrations/email': ['admin'],
  '/settings/integrations/ai': ['admin'],
  '/settings/webhooks': ['admin'],
  '/settings/insurers': ['admin', 'manager'],
  '/settings/relances': ['admin', 'manager'],
  '/settings/couleurs-leads': ['admin', 'manager'],
  '/settings/documents': ['admin', 'manager'],
  '/settings/users': ['admin'],
};

/**
 * Le chemin le plus specifique l'emporte : /settings/webhooks est reserve aux
 * administrateurs meme si /settings est ouvert aux responsables.
 */
export function cheminAutorise(chemin: string, role: UserRole | null): boolean {
  if (!role) return false;

  // Le compte technicien est un accès planning, pas un accès CRM allégé.
  // Cette liste blanche doit précéder la règle générale : les chemins absents
  // de la matrice sont normalement ouverts, ce qui exposerait notamment
  // Aujourd'hui ou de futurs modules ajoutés plus tard.
  if (role === 'technician') {
    return chemin === '/calendar' || chemin.startsWith('/calendar/');
  }

  const correspondances = Object.keys(ROLES_PAR_CHEMIN)
    .filter((p) => chemin === p || chemin.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length);

  if (correspondances.length === 0) return true;
  return ROLES_PAR_CHEMIN[correspondances[0]].includes(role);
}

/** Premier ecran accessible, pour rediriger sans boucler. */
export function accueilDuRole(role: UserRole | null): string {
  switch (role) {
    case 'accountant': return '/billing';
    case 'technician': return '/calendar';
    default: return '/today';
  }
}

export const peutGererIntegrations = (r: UserRole | null) => r === 'admin';
export const peutVoirSecrets = (r: UserRole | null) => r === 'admin';
export const peutGererUtilisateurs = (r: UserRole | null) => r === 'admin';
export const peutSupprimer = (r: UserRole | null) => r === 'admin' || r === 'manager';
