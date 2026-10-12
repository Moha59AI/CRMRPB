import type { UserRole } from '@/types';

export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrateur',
  manager: 'Responsable',
  advisor: 'Conseiller',
  technician: 'Technicien',
  accountant: 'Comptable',
};

export const roleDescriptions: Record<UserRole, string> = {
  admin: 'Accès complet à toutes les fonctionnalités et paramètres',
  manager: 'Gestion des leads, dossiers et équipe',
  advisor: 'Gestion des leads et contacts',
  technician: 'Accès au planning partagé uniquement',
  accountant: 'Accès à la facturation',
};

export const canAccessSettings = (role: UserRole): boolean => {
  return role === 'admin' || role === 'manager';
};

export const canManageIntegrations = (role: UserRole): boolean => {
  return role === 'admin';
};

export const canViewSecrets = (role: UserRole): boolean => {
  return role === 'admin';
};

export const canManageUsers = (role: UserRole): boolean => {
  return role === 'admin';
};
